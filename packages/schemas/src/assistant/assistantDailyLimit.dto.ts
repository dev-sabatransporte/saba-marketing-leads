import { z } from 'zod';
import { buildSafeResponseSchema } from '../utils';

/**
 * Whether the assistant used up today's replies (calendar day in Venezuela):
 * until midnight the team answers the new chats. `false` while it is off.
 */
export const assistantDailyLimitSchema = z.object({ reached: z.boolean() });
export type TAssistantDailyLimit = z.infer<typeof assistantDailyLimitSchema>;

export const assistantDailyLimitResponseSchema = buildSafeResponseSchema(
  assistantDailyLimitSchema
);
export type TAssistantDailyLimitResponse = z.infer<
  typeof assistantDailyLimitResponseSchema
>;
