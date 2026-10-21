import type {
  AssistantSettings,
  AssistantSettingsWithChanges,
} from '../../../domain/AssistantSettings';

export interface GetAssistantSettingsPort {
  execute(): Promise<AssistantSettingsWithChanges>;
}

export interface UpdateAssistantSettingsPort {
  execute(input: {
    patch: Partial<AssistantSettings>;
    changedBy: { id: string; name: string };
  }): Promise<AssistantSettingsWithChanges>;
}
