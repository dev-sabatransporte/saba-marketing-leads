import { getAPIClient } from '@/lib/api';
import { AssistantSettingsServiceClass } from './assistantSettings.service';
import { WeeklySummaryServiceClass } from './weeklySummary.service';

const api = getAPIClient();
export const AssistantSettingsService = new AssistantSettingsServiceClass(
  api.v1.assistant
);
export const WeeklySummaryService = new WeeklySummaryServiceClass(
  api.v1.assistant
);
