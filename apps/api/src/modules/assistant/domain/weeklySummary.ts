import {
  HANDOFF_REASONS,
  type HandoffReason,
  isHandoffReason,
} from './handoff';
import { estimateCost, type ModelUsage } from './modelPricing';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The 7 days up to now: a rolling week always covers seven full days. */
export function weekWindow(now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - WEEK_MS), to: now };
}

/** What the runs of a window add up to, as the repository counts it. */
export interface RunsTally {
  conversations: number;
  resolvedWithoutPerson: number;
  /** Raw stored reasons: an old row may carry one no longer in the list. */
  handoffs: { reason: string | null; count: number }[];
  usageByModel: ModelUsage[];
}

export interface WeeklySummary {
  from: Date;
  to: Date;
  conversations: number;
  resolvedWithoutPerson: number;
  handoffsByReason: Record<HandoffReason, number>;
  estimatedCostUsd: number;
  unpricedModels: string[];
}

export function summarizeWeek(
  window: { from: Date; to: Date },
  tally: RunsTally
): WeeklySummary {
  const handoffsByReason = Object.fromEntries(
    HANDOFF_REASONS.map((reason) => [reason, 0])
  ) as Record<HandoffReason, number>;
  for (const { reason, count } of tally.handoffs) {
    // Shown as the generic one, like the "¿por qué?" does.
    handoffsByReason[isHandoffReason(reason) ? reason : 'error'] += count;
  }
  const cost = estimateCost(tally.usageByModel);
  return {
    ...window,
    conversations: tally.conversations,
    resolvedWithoutPerson: tally.resolvedWithoutPerson,
    handoffsByReason,
    estimatedCostUsd: cost.usd,
    unpricedModels: cost.unpricedModels,
  };
}
