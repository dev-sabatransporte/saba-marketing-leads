import { z } from 'zod';
import { buildSafeResponseSchema } from '../utils';

/** Why the assistant hands a chat to a person. */
export const ASSISTANT_HANDOFF_REASONS = [
  'out_of_scope',
  'customer_requested',
  'data_not_found',
  'non_text',
  'pricing',
  'out_of_stock',
  'limit_reached',
  'error',
] as const;
export const assistantHandoffReasonSchema = z.enum(ASSISTANT_HANDOFF_REASONS);
export type TAssistantHandoffReason = z.infer<
  typeof assistantHandoffReasonSchema
>;

/** A product search the assistant ran; `resultCount` is `null` if Saba did not answer. */
export const assistantToolCallSchema = z.object({
  tool: z.literal('search_products'),
  query: z.string(),
  resultCount: z.number().int().nullable(),
});

/**
 * The "¿por qué?" of a message the assistant sent: what it searched, how many
 * results came back and, if it handed over, why. Only what the turn recorded;
 * never the model's reasoning nor technical error details.
 */
export const assistantMessageExplanationSchema = z.object({
  outcome: z.enum(['answered', 'handoff']),
  /** Set only when `outcome` is `handoff`. */
  handoffReason: assistantHandoffReasonSchema.nullable(),
  toolCalls: z.array(assistantToolCallSchema),
});
export type TAssistantMessageExplanation = z.infer<
  typeof assistantMessageExplanationSchema
>;

export const assistantMessageExplanationResponseSchema =
  buildSafeResponseSchema(assistantMessageExplanationSchema);
export type TAssistantMessageExplanationResponse = z.infer<
  typeof assistantMessageExplanationResponseSchema
>;
