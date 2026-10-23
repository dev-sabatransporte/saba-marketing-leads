import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  lt,
  lte,
  sql,
  sum,
} from 'drizzle-orm';
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
import type { RunsTally } from '../../domain/weeklySummary';
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

  async tally({ from, to }: { from: Date; to: Date }): Promise<RunsTally> {
    const inWindow = and(
      gte(assistantRuns.createdAt, from),
      lte(assistantRuns.createdAt, to)
    );
    // One row per chat the assistant spoke in (an answer or a handoff); an
    // `error` run means a person took it while the model was answering.
    // `bool_or` in `sql`: the builder has no boolean aggregates.
    const chats = this.db
      .select({
        needsPerson:
          sql<boolean>`bool_or(${assistantRuns.outcome} <> 'answered')`.as(
            'needs_person'
          ),
      })
      .from(assistantRuns)
      .where(inWindow)
      .groupBy(assistantRuns.conversationId)
      .having(sql`bool_or(${assistantRuns.outcome} <> 'error')`)
      .as('chats');
    const [[attended], handoffs, usage] = await Promise.all([
      this.db
        .select({
          conversations: count(),
          // Builder has no FILTER clause: a count over a condition needs `sql`.
          resolvedWithoutPerson:
            sql<number>`count(*) filter (where not ${chats.needsPerson})`.mapWith(
              Number
            ),
        })
        .from(chats),
      this.db
        .select({ reason: assistantRuns.reason, count: count() })
        .from(assistantRuns)
        .where(and(inWindow, eq(assistantRuns.outcome, 'handoff')))
        .groupBy(assistantRuns.reason),
      this.db
        .select({
          model: assistantRuns.model,
          inputTokens: sum(assistantRuns.inputTokens).mapWith(Number),
          outputTokens: sum(assistantRuns.outputTokens).mapWith(Number),
          cacheReadTokens: sum(assistantRuns.cacheReadTokens).mapWith(Number),
          cacheWriteTokens: sum(assistantRuns.cacheWriteTokens).mapWith(Number),
        })
        .from(assistantRuns)
        .where(and(inWindow, isNotNull(assistantRuns.model)))
        .groupBy(assistantRuns.model),
    ]);
    return {
      conversations: attended?.conversations ?? 0,
      resolvedWithoutPerson: attended?.resolvedWithoutPerson ?? 0,
      handoffs,
      usageByModel: usage.flatMap(({ model, ...tokens }) =>
        model
          ? [
              {
                model,
                usage: {
                  inputTokens: tokens.inputTokens ?? 0,
                  outputTokens: tokens.outputTokens ?? 0,
                  cacheReadTokens: tokens.cacheReadTokens ?? 0,
                  cacheWriteTokens: tokens.cacheWriteTokens ?? 0,
                },
              },
            ]
          : []
      ),
    };
  }

  async deleteCreatedBefore(cutoff: Date): Promise<number> {
    const deleted = await this.db
      .delete(assistantRuns)
      .where(lt(assistantRuns.createdAt, cutoff))
      .returning({ id: assistantRuns.id });
    return deleted.length;
  }
}
