import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import {
  type ApiDb,
  DRIZZLE_CLIENT,
} from '../../../../infrastructure/database/drizzle.module';
import type {
  ClaimDueInput,
  ClaimedBatch,
  PendingRepliesRepositoryPort,
} from '../../application/ports/out/PendingRepliesRepositoryPort';
import { addToBatch, type ReplyWait } from '../../domain/pendingReply';
import { assistantPendingReplies as pending } from './assistant.schema';

@Injectable()
export class DrizzlePendingRepliesRepository
  implements PendingRepliesRepositoryPort
{
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: ApiDb) {}

  async add(
    conversationId: string,
    messageId: string,
    now: Date,
    wait: ReplyWait
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // The row first, locked by the insert itself: an existing one is
      // "updated" to itself. DO NOTHING would not lock it, and a release
      // could delete the empty row before the select below, losing the message.
      await tx
        .insert(pending)
        .values({ conversationId })
        .onConflictDoUpdate({
          target: pending.conversationId,
          set: { conversationId: sql`excluded.conversation_id` },
        });
      const [row] = await tx
        .select({
          messageIds: pending.messageIds,
          firstPendingAt: pending.firstPendingAt,
          dueAt: pending.dueAt,
        })
        .from(pending)
        .where(eq(pending.conversationId, conversationId))
        .for('update');
      if (!row) throw new Error(`sin fila en la cola para ${conversationId}`);
      await tx
        .update(pending)
        .set(addToBatch(row, messageId, now, wait))
        .where(eq(pending.conversationId, conversationId));
    });
  }

  claimDue({
    now,
    staleBefore,
    limit,
  }: ClaimDueInput): Promise<ClaimedBatch[]> {
    return this.db.transaction(async (tx) => {
      const due = await tx
        .select({ conversationId: pending.conversationId })
        .from(pending)
        .where(
          or(
            and(isNull(pending.claimedAt), lte(pending.dueAt, now)),
            lt(pending.claimedAt, staleBefore)
          )
        )
        .orderBy(asc(pending.dueAt))
        .limit(limit)
        .for('update', { skipLocked: true });
      if (!due.length) return [];

      const claimed = await tx
        .update(pending)
        .set({
          // A claim taken back answers its messages together with the new ones.
          // Raw: the builder has no array concatenation between columns.
          claimedIds: sql`${pending.claimedIds} || ${pending.messageIds}`,
          messageIds: sql`'{}'`,
          firstPendingAt: null,
          dueAt: null,
          claimedAt: now,
        })
        .where(
          inArray(
            pending.conversationId,
            due.map((row) => row.conversationId)
          )
        )
        .returning({
          conversationId: pending.conversationId,
          messageIds: pending.claimedIds,
        });
      const order = due.map((row) => row.conversationId);
      return claimed
        .sort(
          (a, b) =>
            order.indexOf(a.conversationId) - order.indexOf(b.conversationId)
        )
        .map(({ conversationId, messageIds }) => ({
          conversationId,
          messageIds,
          claimedAt: now,
        }));
    });
  }

  async release({ conversationId, claimedAt }: ClaimedBatch): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Only this claim: if it was taken back, the new turn owns the row.
      await tx
        .update(pending)
        .set({ claimedIds: sql`'{}'`, claimedAt: null })
        .where(
          and(
            eq(pending.conversationId, conversationId),
            eq(pending.claimedAt, claimedAt)
          )
        );
      await tx.delete(pending).where(
        and(
          eq(pending.conversationId, conversationId),
          isNull(pending.claimedAt),
          // Raw: the builder has no operator for an empty array.
          sql`cardinality(${pending.messageIds}) = 0`
        )
      );
    });
  }
}
