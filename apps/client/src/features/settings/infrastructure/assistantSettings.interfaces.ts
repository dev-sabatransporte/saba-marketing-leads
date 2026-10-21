import type {
  TAssistantSettings,
  TUpdateAssistantSettings,
} from '@repo/schemas';
import type { Safe } from '@repo/utils';

/** Port: the only thing this feature needs from the API. */
export interface AssistantSettingsApi {
  getSettings(): Promise<Safe<TAssistantSettings>>;
  updateSettings(
    data: TUpdateAssistantSettings
  ): Promise<Safe<TAssistantSettings>>;
}
