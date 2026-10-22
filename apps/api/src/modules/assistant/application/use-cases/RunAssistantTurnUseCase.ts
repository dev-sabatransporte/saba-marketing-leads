import { Inject, Injectable } from '@nestjs/common';
import { ModelUnavailableError } from '../../domain/AssistantErrors';
import {
  addUsage,
  type NewAssistantRun,
  type TokenUsage,
  type ToolCall,
} from '../../domain/AssistantRun';
import {
  aPersonHasTheChat,
  type ModelTurn,
  toModelTurns,
  withinReplyWindow,
} from '../../domain/conversation';
import {
  type HandoffReason,
  handoffNotice,
  mentionsAnAmount,
} from '../../domain/handoff';
import { buildInstructions } from '../../domain/instructions';
import { withMapLinks } from '../../domain/mapLinks';
import {
  contactWindowStart,
  startOfVenezuelanDay,
} from '../../domain/replyLimits';
import { ASSISTANT_TOKENS } from '../../tokens';
import type {
  RunAssistantTurnPort,
  TurnResult,
} from '../ports/in/RunAssistantTurnPort';
import type {
  AssistantModelPort,
  ModelReply,
  ProductSearch,
} from '../ports/out/AssistantModelPort';
import type { AssistantRunsRepositoryPort } from '../ports/out/AssistantRunsRepositoryPort';
import type { AssistantSettingsRepositoryPort } from '../ports/out/AssistantSettingsRepositoryPort';
import type { ChatChannelPort } from '../ports/out/ChatChannelPort';
import type { ClockPort } from '../ports/out/ClockPort';
import type { ProductCatalogPort } from '../ports/out/ProductCatalogPort';
import type { StoresSourcePort } from '../ports/out/StoresSourcePort';

// Enough context for a short WhatsApp exchange without paying for old chats.
const HISTORY_LIMIT = 20;
// A customer asks about one or two models; more searches means the model is lost.
const MAX_SEARCHES = 3;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type RunFields = Pick<
  NewAssistantRun,
  'sentMessageId' | 'outcome' | 'reason' | 'errorDetail' | 'model' | 'usage'
>;

interface Billed {
  model: string | null;
  usage: TokenUsage | null;
}

type Decision =
  | {
      kind: 'decided';
      reply: Exclude<ModelReply, { kind: 'search_products' }>;
      billed: Billed;
    }
  | { kind: 'failed'; errorDetail: string; billed: Billed };

/**
 * One assistant turn: the customer messages gathered while it waited in, at
 * most one message out, and a row in `assistant_runs` for every attempt. When it must not or cannot
 * answer it hands the chat to a person ("Necesita asesor") and goes silent
 * until then. Switched off, or with nothing pending, it does nothing.
 * Past the day's limit it stays silent for everyone until midnight in
 * Venezuela; past a contact's limit it hands that chat over.
 */
@Injectable()
export class RunAssistantTurnUseCase implements RunAssistantTurnPort {
  constructor(
    @Inject(ASSISTANT_TOKENS.Settings)
    private readonly settings: AssistantSettingsRepositoryPort,
    @Inject(ASSISTANT_TOKENS.Channel) private readonly channel: ChatChannelPort,
    @Inject(ASSISTANT_TOKENS.Stores) private readonly stores: StoresSourcePort,
    @Inject(ASSISTANT_TOKENS.Products)
    private readonly products: ProductCatalogPort,
    @Inject(ASSISTANT_TOKENS.Model) private readonly model: AssistantModelPort,
    @Inject(ASSISTANT_TOKENS.Runs)
    private readonly runs: AssistantRunsRepositoryPort,
    @Inject(ASSISTANT_TOKENS.Clock) private readonly clock: ClockPort
  ) {}

  async execute({
    conversationId,
    messageIds,
  }: {
    conversationId: string;
    messageIds: string[];
  }): Promise<TurnResult> {
    // Read on every turn: switching it off during the wait applies too.
    const { enabled, simpleReplies, dailyReplyLimit, perContactDailyLimit } =
      await this.settings.get();
    if (!enabled) return 'disabled';

    const chat = await this.channel.read(conversationId, HISTORY_LIMIT);
    if (
      !chat?.waId ||
      aPersonHasTheChat(chat) ||
      !withinReplyWindow(chat.lastInboundAt, this.clock.now())
    ) {
      return 'ignored';
    }

    const now = this.clock.now();
    // No handoff here: the team sees the panel's notice instead, and handing
    // every chat over would leave them a pile of "Necesita asesor".
    if (
      (await this.runs.countReplies({ since: startOfVenezuelanDay(now) })) >=
      dailyReplyLimit
    ) {
      return 'daily_limit';
    }

    const startedAt = now.getTime();
    const toolCalls: ToolCall[] = [];
    const run = (fields: RunFields): Promise<void> => {
      const finishedAt = this.clock.now();
      return this.runs.record({
        conversationId,
        inboundMessageIds: messageIds,
        latencyMs: finishedAt.getTime() - startedAt,
        toolCalls: [...toolCalls],
        createdAt: finishedAt,
        ...fields,
      });
    };
    const handOver = (
      reason: HandoffReason,
      details: Pick<RunFields, 'errorDetail' | 'model' | 'usage'>
    ): Promise<TurnResult> =>
      this.handOver(conversationId, reason, details, run);

    // The handoff mark keeps it to a single one: the chat stays silent until resolved.
    if (
      (await this.runs.countReplies({
        since: contactWindowStart(now),
        conversationId,
      })) >= perContactDailyLimit
    ) {
      return handOver('limit_reached', {
        errorDetail: null,
        model: null,
        usage: null,
      });
    }
    // One image among the texts is enough: someone has to open it.
    const batch = chat.messages.filter((m) => messageIds.includes(m.id));
    if (batch.some((m) => m.type !== 'text')) {
      return handOver('non_text', {
        errorDetail: null,
        model: null,
        usage: null,
      });
    }
    const turns = toModelTurns(chat.messages, messageIds);
    if (!turns.length) return 'ignored';

    await this.channel.showTyping(conversationId);

    const { stores, misconfigured } = await this.stores.current();
    if (misconfigured) {
      return handOver('error', {
        errorDetail: 'Saba rechazó la llave del asistente o falta configurarla',
        model: null,
        usage: null,
      });
    }

    const decision = await this.decide(
      buildInstructions(stores, { simpleReplies }),
      turns,
      simpleReplies,
      toolCalls
    );
    if (decision.kind === 'failed') {
      return handOver('error', {
        errorDetail: decision.errorDetail,
        ...decision.billed,
      });
    }
    const { reply, billed } = decision;
    // The model takes seconds: a person may have taken the chat meanwhile.
    const latest = await this.channel.read(conversationId, HISTORY_LIMIT);
    if (!latest || aPersonHasTheChat(latest)) {
      await run({
        sentMessageId: null,
        outcome: 'error',
        reason: 'person_took_over',
        errorDetail: 'una persona tomó el chat mientras el modelo respondía',
        ...billed,
      });
      return 'ignored';
    }
    if (reply.kind === 'handoff') {
      return handOver(reply.reason, { errorDetail: null, ...billed });
    }
    if (mentionsAnAmount(reply.text)) {
      return handOver('pricing', {
        errorDetail: 'la respuesta mencionaba un monto; no se envió',
        ...billed,
      });
    }

    let sentMessageId: string;
    try {
      sentMessageId = (
        await this.channel.sendAsAssistant(
          conversationId,
          withMapLinks(reply.text, stores)
        )
      ).id;
    } catch (error: unknown) {
      return handOver('error', {
        errorDetail: `send_failed: ${describe(error)}`,
        ...billed,
      });
    }

    // Outside the try: a failure here must not log a reply that did go out as failed.
    await run({
      sentMessageId,
      outcome: 'answered',
      reason: null,
      errorDetail: null,
      ...billed,
    });
    return 'answered';
  }

  /**
   * Asks the model until it answers or hands over, running on Saba each
   * product search it asks for. Every search lands in `toolCalls`, so the
   * run records it whatever happens next.
   */
  private async decide(
    instructions: string,
    turns: ModelTurn[],
    simpleReplies: boolean,
    toolCalls: ToolCall[]
  ): Promise<Decision> {
    const searches: ProductSearch[] = [];
    let billed: Billed = { model: null, usage: null };
    for (;;) {
      let reply: ModelReply;
      try {
        reply = await this.model.reply({
          instructions,
          turns,
          searches,
          simpleReplies,
        });
      } catch (error: unknown) {
        const unavailable =
          error instanceof ModelUnavailableError ? error : null;
        const detail = describe(error);
        return {
          kind: 'failed',
          errorDetail: unavailable
            ? `${unavailable.reason}: ${detail}`
            : detail,
          billed: unavailable?.billed
            ? {
                model: unavailable.billed.model,
                usage: addUsage(billed.usage, unavailable.billed.usage),
              }
            : billed,
        };
      }
      billed = {
        model: reply.model,
        usage: addUsage(billed.usage, reply.usage),
      };
      if (reply.kind !== 'search_products') {
        return { kind: 'decided', reply, billed };
      }
      if (searches.length === MAX_SEARCHES) {
        return {
          kind: 'failed',
          errorDetail: `el modelo pidió más de ${MAX_SEARCHES} búsquedas`,
          billed,
        };
      }

      const { callId, query } = reply;
      try {
        const products = await this.products.search(query);
        toolCalls.push({
          tool: 'search_products',
          query,
          resultCount: products.length,
        });
        searches.push({ callId, query, products });
      } catch (error: unknown) {
        // Saba down, slow, rate-limited or the key rejected: never a guess.
        toolCalls.push({ tool: 'search_products', query, resultCount: null });
        return {
          kind: 'failed',
          errorDetail: `search_products: ${describe(error)}`,
          billed,
        };
      }
    }
  }

  /**
   * Marks the chat for a person, tells the customer with a fixed text and
   * records why. The mark goes first: if it fails nothing is sent and the
   * assistant does not keep answering a chat it meant to hand over; if only
   * the notice fails, someone still picks the chat up.
   */
  private async handOver(
    conversationId: string,
    reason: HandoffReason,
    details: Pick<RunFields, 'errorDetail' | 'model' | 'usage'>,
    run: (fields: RunFields) => Promise<void>
  ): Promise<TurnResult> {
    await this.channel.requestHandoff(conversationId, reason);
    let sentMessageId: string | null = null;
    let noticeError: string | null = null;
    try {
      sentMessageId = (
        await this.channel.sendAsAssistant(
          conversationId,
          handoffNotice(reason)
        )
      ).id;
    } catch (error: unknown) {
      noticeError = `aviso no enviado: ${describe(error)}`;
    }
    await run({
      ...details,
      sentMessageId,
      outcome: 'handoff',
      reason,
      errorDetail:
        [details.errorDetail, noticeError].filter(Boolean).join('; ') || null,
    });
    return 'handoff';
  }
}
