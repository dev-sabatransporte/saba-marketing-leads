import { getAPIClient } from '@/lib/api';
import { AssistantSettingsServiceClass } from './assistantSettings.service';

const api = getAPIClient();
export const AssistantSettingsService = new AssistantSettingsServiceClass(
  api.v1.assistant
);
