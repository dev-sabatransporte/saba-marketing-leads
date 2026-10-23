import { z } from 'zod';
import { buildSafeResponseSchema } from '../utils';
import { assistantHandoffReasonSchema } from './assistantMessageExplanation.dto';

/**
 * How the assistant did over the last 7 days, for whoever manages it. Built
 * from `assistant_runs`, so it never reaches further back than their 90 days.
 */
export const assistantWeeklySummarySchema = z.object({
  /** The window, as ISO dates: the 7 days up to now. */
  from: z.string(),
  to: z.string(),
  /** Chats where it sent an answer or a handoff notice. */
  conversations: z.number().int(),
  /** Of those, the ones it neither handed over nor saw a person take. */
  resolvedWithoutPerson: z.number().int(),
  handoffsByReason: z.record(assistantHandoffReasonSchema, z.number().int()),
  /** From the tokens of every turn, failed ones included: they are billed too. */
  estimatedCostUsd: z.number(),
  /** Models used in the window without a known tariff; their tokens are not in the cost. */
  unpricedModels: z.array(z.string()),
});
export type TAssistantWeeklySummary = z.infer<
  typeof assistantWeeklySummarySchema
>;

export const assistantWeeklySummaryResponseSchema = buildSafeResponseSchema(
  assistantWeeklySummarySchema
);
export type TAssistantWeeklySummaryResponse = z.infer<
  typeof assistantWeeklySummaryResponseSchema
>;
