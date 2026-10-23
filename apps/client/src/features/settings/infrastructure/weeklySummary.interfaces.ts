import type { TAssistantWeeklySummary } from '@repo/schemas';
import type { Safe } from '@repo/utils';

/** Port: what the summary needs from the API. */
export interface WeeklySummaryApi {
  getWeeklySummary(): Promise<Safe<TAssistantWeeklySummary>>;
}
