import { Inject, Injectable } from '@nestjs/common';
import { ModelUnavailableError } from '../../domain/AssistantErrors';
import type { NewAssistantRun } from '../../domain/AssistantRun';
import {
  isLatestCustomerMessage,
  toModelTurns,
  withinReplyWindow,
} from '../../domain/conversation';
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

/**
 * One assistant turn: a customer text message in, at most one message out,
 * and a row in `assistant_runs` for every attempt. Switched off, or with
 * nothing it can answer, it does nothing and records nothing.
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
    if (type !== 'text') return 'ignored';

    const chat = await this.channel.read(conversationId, HISTORY_LIMIT);
    if (
      !chat?.waId ||
      !withinReplyWindow(chat.lastInboundAt, this.clock.now())
    ) {
      return 'ignored';
    }
    // Several messages at once: only the newest one's turn answers them all.
    if (!isLatestCustomerMessage(chat.messages, messageId)) return 'ignored';
    const turns = toModelTurns(chat.messages);
    if (!turns.length) return 'ignored';

    const startedAt = this.clock.now().getTime();
    const run = (
      fields: Pick<
        NewAssistantRun,
        | 'sentMessageId'
        | 'outcome'
        | 'reason'
        | 'errorDetail'
        | 'model'
        | 'usage'
      >
    ): Promise<void> =>
      this.runs.record({
        conversationId,
        inboundMessageIds: [messageId],
        latencyMs: this.clock.now().getTime() - startedAt,
        ...fields,
      });

    let answer: ModelReply;
    try {
      const instructions = buildInstructions(await this.stores.current());
      answer = await this.model.reply({ instructions, turns });
    } catch (error: unknown) {
      const unavailable = error instanceof ModelUnavailableError ? error : null;
      await run({
        sentMessageId: null,
        outcome: 'error',
        reason: unavailable?.reason ?? 'model_failed',
        errorDetail: error instanceof Error ? error.message : String(error),
        model: unavailable?.billed?.model ?? null,
        usage: unavailable?.billed?.usage ?? null,
      });
      return 'error';
    }

    let sentMessageId: string;
    try {
      sentMessageId = (
        await this.channel.sendAsAssistant(conversationId, answer.text)
      ).id;
    } catch (error: unknown) {
      await run({
        sentMessageId: null,
        outcome: 'error',
        reason: 'send_failed',
        errorDetail: error instanceof Error ? error.message : String(error),
        model: answer.model,
        usage: answer.usage,
      });
      return 'error';
    }

    // Outside the try: a failure here must not log a reply that did go out as failed.
    await run({
      sentMessageId,
      outcome: 'answered',
      reason: null,
      errorDetail: null,
      model: answer.model,
      usage: answer.usage,
    });
    return 'answered';
  }
}
