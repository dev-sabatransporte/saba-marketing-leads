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
