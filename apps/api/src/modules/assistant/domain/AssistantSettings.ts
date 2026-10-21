export interface AssistantSettings {
  enabled: boolean;
  perContactDailyLimit: number;
  debounceSeconds: number;
  maxWaitSeconds: number;
  dailyReplyLimit: number;
  /** Shortest possible answers and a low output cap, to spend fewer tokens. */
  simpleReplies: boolean;
}

/** What applies if the row is missing: off, so nothing answers by accident. */
export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  enabled: false,
  perContactDailyLimit: 20,
  debounceSeconds: 8,
  maxWaitSeconds: 30,
  dailyReplyLimit: 300,
  simpleReplies: true,
};

export type AssistantSettingKey = keyof AssistantSettings;

export interface SettingChange {
  /** A Saba profile, with the name it had then. */
  changedBy: { id: string; name: string };
  changedAt: Date;
}

/** The last change of each setting; a missing key still has its default. */
export type SettingChanges = Partial<
  Record<AssistantSettingKey, SettingChange>
>;

export interface AssistantSettingsWithChanges {
  settings: AssistantSettings;
  changes: SettingChanges;
}

/** The settings a patch really changes: same value again is not a change. */
export function changedSettings(
  current: AssistantSettings,
  patch: Partial<AssistantSettings>
): AssistantSettingKey[] {
  return (Object.keys(patch) as AssistantSettingKey[]).filter(
    (key) => patch[key] !== undefined && patch[key] !== current[key]
  );
}

/** A customer is never kept waiting past the cap, so it cannot be shorter. */
export function maxWaitIsBelowDebounce(settings: AssistantSettings): boolean {
  return settings.maxWaitSeconds < settings.debounceSeconds;
}
