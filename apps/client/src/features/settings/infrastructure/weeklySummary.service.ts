import type { WeeklySummary } from '../domain/weeklySummary.model';
import type { WeeklySummaryApi } from './weeklySummary.interfaces';
import { toWeeklySummaryDomain } from './weeklySummary.transform';

export class WeeklySummaryServiceClass {
  constructor(private summaryApi: WeeklySummaryApi) {}

  async get(): Promise<WeeklySummary> {
    const result = await this.summaryApi.getWeeklySummary();
    if (!result.success) throw new Error(result.error);
    return toWeeklySummaryDomain(result.data);
  }
}
