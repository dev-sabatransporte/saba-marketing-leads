import type { ReplyWait } from '../../../domain/pendingReply';

/** A batch a turn is answering; `claimedAt` identifies the claim. */
export interface ClaimedBatch {
  conversationId: string;
  messageIds: string[];
  claimedAt: Date;
}

/** The customer messages waiting for the assistant, per chat. */
export interface PendingRepliesRepositoryPort {
  /** Adds the message to the chat's next batch and moves its due time. */
  add(
    conversationId: string,
    messageId: string,
    now: Date,
    wait: ReplyWait
  ): Promise<void>;
  /**
   * Takes the batches due by `now`, atomically: two sweeps never get the same
   * one. A chat with a turn running is skipped until it ends, unless the
   * claim is older than `staleBefore` (the API died mid-turn).
   */
  claimDue(input: {
    now: Date;
    staleBefore: Date;
    limit: number;
  }): Promise<ClaimedBatch[]>;
  /** The turn ended: its messages leave the queue. */
  release(batch: ClaimedBatch): Promise<void>;
}
