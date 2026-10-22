import type { ReplyWait } from '../../../domain/pendingReply';

/** A batch a turn is answering; `claimedAt` identifies the claim. */
export interface ClaimedBatch {
  conversationId: string;
  messageIds: string[];
  claimedAt: Date;
}

export interface ClaimDueInput {
  now: Date;
  /** A claim older than this belongs to an API that died mid-turn. */
  staleBefore: Date;
  /** At most this many chats per call. */
  limit: number;
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
  claimDue(input: ClaimDueInput): Promise<ClaimedBatch[]>;
  /** The turn ended: its messages leave the queue. */
  release(batch: ClaimedBatch): Promise<void>;
}
