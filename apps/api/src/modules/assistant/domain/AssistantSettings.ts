export interface AssistantSettings {
  enabled: boolean;
  perContactDailyLimit: number;
  debounceSeconds: number;
  maxWaitSeconds: number;
  dailyReplyLimit: number;
}

/** What applies if the row is missing: off, so nothing answers by accident. */
export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  enabled: false,
  perContactDailyLimit: 20,
  debounceSeconds: 8,
  maxWaitSeconds: 30,
  dailyReplyLimit: 300,
};
