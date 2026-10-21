import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ToolCall } from '../../domain/AssistantRun';

/**
 * A single row (`id = 1`): the assistant's switch and limits. Read on every
 * turn, so a change applies without restarting. Starts off.
 */
export const assistantSettings = pgTable(
  'assistant_settings',
  {
    id: integer('id').primaryKey().default(1),
    enabled: boolean('enabled').notNull().default(false),
    perContactDailyLimit: integer('per_contact_daily_limit')
      .notNull()
      .default(20),
    debounceSeconds: integer('debounce_seconds').notNull().default(8),
    maxWaitSeconds: integer('max_wait_seconds').notNull().default(30),
    dailyReplyLimit: integer('daily_reply_limit').notNull().default(300),
    simpleReplies: boolean('simple_replies').notNull().default(true),
    // A Saba `profiles` id, without FK: the table belongs to another system.
    updatedBy: uuid('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check('assistant_settings_single_row', sql`${table.id} = 1`)]
);

/**
 * One row per assistant turn: what it answered (or why not), with the model,
 * tokens and latency. Conversation and messages are WhatsApp ids, without FK:
 * those tables belong to the `whatsapp` module.
 */
export const assistantRuns = pgTable(
  'assistant_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').notNull(),
    inboundMessageIds: uuid('inbound_message_ids').array().notNull(),
    sentMessageId: uuid('sent_message_id'),
    outcome: text('outcome', {
      enum: ['answered', 'handoff', 'error'],
    }).notNull(),
    reason: text('reason'),
    errorDetail: text('error_detail'),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    cacheWriteTokens: integer('cache_write_tokens'),
    // What it searched and how many results came back, for the "¿por qué?".
    toolCalls: jsonb('tool_calls').$type<ToolCall[]>().notNull().default([]),
    latencyMs: integer('latency_ms').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'assistant_runs_outcome_check',
      sql`${table.outcome} IN ('answered', 'handoff', 'error')`
    ),
    index('assistant_runs_conversation_created_idx').on(
      table.conversationId,
      table.createdAt.desc()
    ),
    index('assistant_runs_created_idx').on(table.createdAt),
  ]
);
