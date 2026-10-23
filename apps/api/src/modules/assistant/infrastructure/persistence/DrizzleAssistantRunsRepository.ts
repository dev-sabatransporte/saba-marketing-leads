import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte } from 'drizzle-orm';
import {
  type ApiDb,
  DRIZZLE_CLIENT,
} from '../../../../infrastructure/database/drizzle.module';
import type { AssistantRunsRepositoryPort } from '../../application/ports/out/AssistantRunsRepositoryPort';
import type {
  MessageExplanation,
  NewAssistantRun,
} from '../../domain/AssistantRun';
import { isHandoffReason } from '../../domain/handoff';
import { assistantRuns } from './assistant.schema';

@Injectable()
export class DrizzleAssistantRunsRepository
  implements AssistantRunsRepositoryPort
{
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: ApiDb) {}

  async record(run: NewAssistantRun): Promise<void> {
    await this.db.insert(assistantRuns).values({
      conversationId: run.conversationId,
      inboundMessageIds: run.inboundMessageIds,
      sentMessageId: run.sentMessageId,
      outcome: run.outcome,
      reason: run.reason,
      errorDetail: run.errorDetail,
      model: run.model,
      inputTokens: run.usage?.inputTokens ?? null,
      outputTokens: run.usage?.outputTokens ?? null,
      cacheReadTokens: run.usage?.cacheReadTokens ?? null,
      cacheWriteTokens: run.usage?.cacheWriteTokens ?? null,
      toolCalls: run.toolCalls,
      latencyMs: run.latencyMs,
      createdAt: run.createdAt,
    });
  }

  async countReplies({
    since,
    conversationId,
  }: {
    since: Date;
    conversationId?: string;
  }): Promise<number> {
    const [row] = await this.db
      .select({ replies: count() })
      .from(assistantRuns)
      .where(
        and(
          eq(assistantRuns.outcome, 'answered'),
          gte(assistantRuns.createdAt, since),
          conversationId
            ? eq(assistantRuns.conversationId, conversationId)
            : undefined
        )
      );
    return row?.replies ?? 0;
  }

  async explainSentMessage(
    messageId: string
  ): Promise<MessageExplanation | null> {
    const [row] = await this.db
      .select({
        outcome: assistantRuns.outcome,
        reason: assistantRuns.reason,
        toolCalls: assistantRuns.toolCalls,
      })
      .from(assistantRuns)
      .where(eq(assistantRuns.sentMessageId, messageId))
      .orderBy(desc(assistantRuns.createdAt))
      .limit(1);
    if (!row) return null;
    const { toolCalls } = row;
    if (row.outcome === 'answered') return { outcome: 'answered', toolCalls };
    // Only answers and handoffs send a message; a reason outside the list
    // would be an old row, shown as the generic one.
    return {
      outcome: 'handoff',
      reason: isHandoffReason(row.reason) ? row.reason : 'error',
      toolCalls,
    };
  }
}
