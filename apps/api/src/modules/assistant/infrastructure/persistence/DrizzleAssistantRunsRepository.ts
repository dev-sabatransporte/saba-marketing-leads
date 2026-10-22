import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte } from 'drizzle-orm';
import {
  type ApiDb,
  DRIZZLE_CLIENT,
} from '../../../../infrastructure/database/drizzle.module';
import type { AssistantRunsRepositoryPort } from '../../application/ports/out/AssistantRunsRepositoryPort';
import type { NewAssistantRun } from '../../domain/AssistantRun';
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
}
