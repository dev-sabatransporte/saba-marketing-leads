import { Inject, Injectable } from '@nestjs/common';
import { isForTheAssistant } from '../../domain/conversation';
import { ASSISTANT_TOKENS } from '../../tokens';
import type {
  ScheduleReplyPort,
  ScheduleResult,
} from '../ports/in/ScheduleReplyPort';
import type { AssistantSettingsRepositoryPort } from '../ports/out/AssistantSettingsRepositoryPort';
import type { ClockPort } from '../ports/out/ClockPort';
import type { PendingRepliesRepositoryPort } from '../ports/out/PendingRepliesRepositoryPort';

/**
 * Does not answer: it puts the message in the chat's batch and moves when it
 * is due, so "hola", "una pregunta", "¿tienen la moto X?" get one reply. The
 * turn checks again whether it may answer once the wait is over.
 */
@Injectable()
export class ScheduleReplyUseCase implements ScheduleReplyPort {
  constructor(
    @Inject(ASSISTANT_TOKENS.Settings)
    private readonly settings: AssistantSettingsRepositoryPort,
    @Inject(ASSISTANT_TOKENS.PendingReplies)
    private readonly pending: PendingRepliesRepositoryPort,
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
  }): Promise<ScheduleResult> {
    const { enabled, debounceSeconds, maxWaitSeconds } =
      await this.settings.get();
    if (!enabled) return 'disabled';
    if (!isForTheAssistant(type)) return 'ignored';
    await this.pending.add(conversationId, messageId, this.clock.now(), {
      debounceSeconds,
      maxWaitSeconds,
    });
    return 'scheduled';
  }
}
