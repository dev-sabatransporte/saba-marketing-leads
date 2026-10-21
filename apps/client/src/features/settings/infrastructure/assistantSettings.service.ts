import type { TUpdateAssistantSettings } from '@repo/schemas';
import type { Safe } from '@repo/utils';
import type { AssistantSettings } from '../domain/assistantSettings.model';
import type { AssistantSettingsApi } from './assistantSettings.interfaces';
import { toAssistantSettingsDomain } from './assistantSettings.transform';

function data<T>(result: Safe<T>): T {
  if (!result.success) throw new Error(result.error);
  return result.data;
}

export class AssistantSettingsServiceClass {
  constructor(private settingsApi: AssistantSettingsApi) {}

  async get(): Promise<AssistantSettings> {
    return toAssistantSettingsDomain(
      data(await this.settingsApi.getSettings())
    );
  }

  async update(patch: TUpdateAssistantSettings): Promise<AssistantSettings> {
    return toAssistantSettingsDomain(
      data(await this.settingsApi.updateSettings(patch))
    );
  }
}
