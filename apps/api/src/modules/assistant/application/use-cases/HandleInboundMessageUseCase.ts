import { Inject, Injectable } from '@nestjs/common';
import { ModelUnavailableError } from '../../domain/AssistantErrors';
import type { NewAssistantRun } from '../../domain/AssistantRun';
import {
  isLatestCustomerMessage,
  toModelTurns,
  withinReplyWindow,
} from '../../domain/conversation';
import { HANDOFF_NOTICE, type HandoffReason } from '../../domain/handoff';
import { buildInstructions } from '../../domain/instructions';
import { ASSISTANT_TOKENS } from '../../tokens';
import type {
  HandleInboundMessagePort,
  TurnResult,
} from '../ports/in/HandleInboundMessagePort';
import type {
  AssistantModelPort,
  ModelReply,
} from '../ports/out/AssistantModelPort';
import type { AssistantRunsRepositoryPort } from '../ports/out/AssistantRunsRepositoryPort';
import type { AssistantSettingsRepositoryPort } from '../ports/out/AssistantSettingsRepositoryPort';
import type { ChatChannelPort } from '../ports/out/ChatChannelPort';
import type { ClockPort } from '../ports/out/ClockPort';
import type { StoresSourcePort } from '../ports/out/StoresSourcePort';

// Enough context for a short WhatsApp exchange without paying for old chats.
const HISTORY_LIMIT = 20;

type RunFields = Pick<
  NewAssistantRun,
  'sentMessageId' | 'outcome' | 'reason' | 'errorDetail' | 'model' | 'usage'
>;

/**
 * One assistant turn: a customer message in, at most one message out, and a
 * row in `assistant_runs` for every attempt. When it must not or cannot
 * answer it hands the chat to a person ("Necesita asesor") and goes silent
 * until then. Switched off, or with nothing pending, it does nothing.
 */
@Injectable()
export class HandleInboundMessageUseCase implements HandleInboundMessagePort {
  constructor(
    @Inject(ASSISTANT_TOKENS.Settings)
    private readonly settings: AssistantSettingsRepositoryPort,
    @Inject(ASSISTANT_TOKENS.Channel) private readonly channel: ChatChannelPort,
    @Inject(ASSISTANT_TOKENS.Stores) private readonly stores: StoresSourcePort,
    @Inject(ASSISTANT_TOKENS.Model) private readonly model: AssistantModelPort,
    @Inject(ASSISTANT_TOKENS.Runs)
    private readonly runs: AssistantRunsRepositoryPort,
    @Inject(ASSISTANT_TOKENS.Clock) private readonly clock: ClockPort
  ) {}

  async execute({
    conversationId,
    messageId,
    type,
  }: {
    conversationId: string;
    messageId: string;
    type: string;
  }): Promise<TurnResult> {
    // Read on every turn: switching it off applies to the next message.
    const { enabled } = await this.settings.get();
    if (!enabled) return 'disabled';

    const chat = await this.channel.read(conversationId, HISTORY_LIMIT);
    if (
      !chat?.waId ||
      chat.handoffRequestedAt ||
      !withinReplyWindow(chat.lastInboundAt, this.clock.now())
    ) {
      return 'ignored';
    }
    // Several messages at once: only the newest one's turn answers them all.
    if (!isLatestCustomerMessage(chat.messages, messageId)) return 'ignored';

    const startedAt = this.clock.now().getTime();
    const run = (fields: RunFields): Promise<void> =>
      this.runs.record({
        conversationId,
        inboundMessageIds: [messageId],
        latencyMs: this.clock.now().getTime() - startedAt,
        ...fields,
      });
    const handOver = (
      reason: HandoffReason,
      details: Pick<RunFields, 'errorDetail' | 'model' | 'usage'>
    ): Promise<TurnResult> =>
      this.handOver(conversationId, reason, details, run);

    if (type !== 'text') {
      return handOver('non_text', {
        errorDetail: null,
        model: null,
        usage: null,
      });
    }
    const turns = toModelTurns(chat.messages);
    if (!turns.length) return 'ignored';

    const { stores, misconfigured } = await this.stores.current();
    if (misconfigured) {
      return handOver('error', {
        errorDetail: 'Saba rechazó la llave del asistente o falta configurarla',
        model: null,
        usage: null,
      });
    }

    let reply: ModelReply;
    try {
      reply = await this.model.reply({
        instructions: buildInstructions(stores),
        turns,
      });
    } catch (error: unknown) {
      const unavailable = error instanceof ModelUnavailableError ? error : null;
      const detail = error instanceof Error ? error.message : String(error);
      return handOver('error', {
        errorDetail: unavailable ? `${unavailable.reason}: ${detail}` : detail,
        model: unavailable?.billed?.model ?? null,
        usage: unavailable?.billed?.usage ?? null,
      });
    }
    const billed = { model: reply.model, usage: reply.usage };
    if (reply.kind === 'handoff') {
      return handOver(reply.reason, { errorDetail: null, ...billed });
    }

    let sentMessageId: string;
    try {
      sentMessageId = (
        await this.channel.sendAsAssistant(conversationId, reply.text)
      ).id;
    } catch (error: unknown) {
      return handOver('error', {
        errorDetail: `send_failed: ${error instanceof Error ? error.message : String(error)}`,
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
   * Tells the customer with a fixed text, marks the chat for a person and
   * records why. The mark goes in even if the notice fails: someone has to
   * pick the chat up either way.
   */
  private async handOver(
    conversationId: string,
    reason: HandoffReason,
    details: Pick<RunFields, 'errorDetail' | 'model' | 'usage'>,
    run: (fields: RunFields) => Promise<void>
  ): Promise<TurnResult> {
    let sentMessageId: string | null = null;
    let noticeError: string | null = null;
    try {
      sentMessageId = (
        await this.channel.sendAsAssistant(conversationId, HANDOFF_NOTICE)
      ).id;
    } catch (error: unknown) {
      noticeError = `aviso no enviado: ${error instanceof Error ? error.message : String(error)}`;
    }
    await this.channel.requestHandoff(conversationId, reason);
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
