import {
  ASSISTANT_HANDOFF_REASONS,
  type TAssistantWeeklySummary,
} from '@repo/schemas';
import type { WeeklySummary } from '../domain/weeklySummary.model';

export function toWeeklySummaryDomain(
  dto: TAssistantWeeklySummary
): WeeklySummary {
  return {
    from: new Date(dto.from),
    to: new Date(dto.to),
    conversations: dto.conversations,
    resolvedWithoutPerson: dto.resolvedWithoutPerson,
    // A stable sort: ties keep the order of the reasons in the contract.
    handoffs: ASSISTANT_HANDOFF_REASONS.map((reason) => ({
      reason,
      count: dto.handoffsByReason[reason],
    }))
      .filter(({ count }) => count > 0)
      .sort((a, b) => b.count - a.count),
    estimatedCostUsd: dto.estimatedCostUsd,
    unpricedModels: dto.unpricedModels,
  };
}
