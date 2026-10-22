/** Customer messages waiting for one reply. Empty: nothing pending. */
export interface PendingBatch {
  messageIds: string[];
  firstPendingAt: Date | null;
  dueAt: Date | null;
}

export interface ReplyWait {
  debounceSeconds: number;
  maxWaitSeconds: number;
}

/**
 * Waits for the customer to finish: each message moves the reply to
 * `debounceSeconds` later, but never past `maxWaitSeconds` after the first
 * one, so someone who keeps typing still gets an answer.
 */
export function addToBatch(
  batch: PendingBatch,
  messageId: string,
  now: Date,
  { debounceSeconds, maxWaitSeconds }: ReplyWait
): PendingBatch {
  if (batch.messageIds.includes(messageId)) return batch;
  const firstPendingAt =
    batch.messageIds.length && batch.firstPendingAt
      ? batch.firstPendingAt
      : now;
  return {
    messageIds: [...batch.messageIds, messageId],
    firstPendingAt,
    dueAt: new Date(
      Math.min(
        now.getTime() + debounceSeconds * 1000,
        firstPendingAt.getTime() + maxWaitSeconds * 1000
      )
    ),
  };
}
