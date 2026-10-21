import type {
  AssistantSettingKey,
  AssistantSettings,
  AssistantSettingsWithChanges,
  SettingChange,
} from '../../../domain/AssistantSettings';

/** What a turn needs: the current values. */
export interface AssistantSettingsRepositoryPort {
  get(): Promise<AssistantSettings>;
}

/** What `/settings` needs on top: who changed each value, and saving. */
export interface ManagedAssistantSettingsRepositoryPort
  extends AssistantSettingsRepositoryPort {
  getWithChanges(): Promise<AssistantSettingsWithChanges>;
  /** Writes `settings` and records `change` on each of `changed`. */
  save(
    settings: AssistantSettings,
    changed: AssistantSettingKey[],
    change: SettingChange
  ): Promise<AssistantSettingsWithChanges>;
}
