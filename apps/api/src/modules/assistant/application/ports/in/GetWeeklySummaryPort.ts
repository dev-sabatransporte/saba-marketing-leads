import type { WeeklySummary } from '../../../domain/weeklySummary';

export interface GetWeeklySummaryPort {
  /** How the assistant did over the last 7 days. */
  execute(): Promise<WeeklySummary>;
}
