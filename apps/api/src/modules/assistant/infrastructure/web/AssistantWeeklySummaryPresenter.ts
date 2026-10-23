import type { TAssistantWeeklySummaryResponse } from '@repo/schemas';
import type { WeeklySummary } from '../../domain/weeklySummary';

export function toAssistantWeeklySummaryResponse(
  summary: WeeklySummary
): TAssistantWeeklySummaryResponse {
  return {
    success: true,
    data: {
      from: summary.from.toISOString(),
      to: summary.to.toISOString(),
      conversations: summary.conversations,
      resolvedWithoutPerson: summary.resolvedWithoutPerson,
      handoffsByReason: summary.handoffsByReason,
      estimatedCostUsd: summary.estimatedCostUsd,
      unpricedModels: summary.unpricedModels,
    },
  };
}
