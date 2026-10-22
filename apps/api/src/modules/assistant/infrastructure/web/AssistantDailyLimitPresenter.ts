import type { TAssistantDailyLimitResponse } from '@repo/schemas';
import type { DailyLimitStatus } from '../../application/ports/in/GetDailyLimitStatusPort';

export function toAssistantDailyLimitResponse({
  reached,
}: DailyLimitStatus): TAssistantDailyLimitResponse {
  return { success: true, data: { reached } };
}
