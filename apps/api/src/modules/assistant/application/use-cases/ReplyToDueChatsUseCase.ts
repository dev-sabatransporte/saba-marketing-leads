import { Inject, Injectable } from '@nestjs/common';
import { ASSISTANT_TOKENS } from '../../tokens';
import type { ReplyToDueChatsPort } from '../ports/in/ReplyToDueChatsPort';
import type { RunAssistantTurnPort } from '../ports/in/RunAssistantTurnPort';
import type { ClockPort } from '../ports/out/ClockPort';
import type { PendingRepliesRepositoryPort } from '../ports/out/PendingRepliesRepositoryPort';

// A turn takes seconds (model and Saba time out well before this): a claim
// older than this one belongs to an API that died mid-turn.
const CLAIM_LEASE_MS = 2 * 60 * 1000;
// Each turn waits on the model: a busy minute should not queue chats behind it.
const MAX_CHATS_PER_SWEEP = 10;

@Injectable()
export class ReplyToDueChatsUseCase implements ReplyToDueChatsPort {
  constructor(
    @Inject(ASSISTANT_TOKENS.PendingReplies)
    private readonly pending: PendingRepliesRepositoryPort,
    @Inject(ASSISTANT_TOKENS.RunTurn)
    private readonly turn: RunAssistantTurnPort,
    @Inject(ASSISTANT_TOKENS.Clock) private readonly clock: ClockPort
  ) {}

  async execute(): Promise<number> {
    const now = this.clock.now();
    const batches = await this.pending.claimDue({
      now,
      staleBefore: new Date(now.getTime() - CLAIM_LEASE_MS),
      limit: MAX_CHATS_PER_SWEEP,
    });
    const results = await Promise.allSettled(
      batches.map(async (batch) => {
        try {
          await this.turn.execute({
            conversationId: batch.conversationId,
            messageIds: batch.messageIds,
          });
        } finally {
          // Released even when the turn throws: retrying a turn that keeps
          // failing would call the model again on every sweep.
          await this.pending.release(batch);
        }
      })
    );
    const failed = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    if (failed) {
      const error: unknown = failed.reason;
      throw error;
    }
    return batches.length;
  }
}
