import type {
  TAssistantSettingChange,
  TAssistantSettingsResponse,
} from '@repo/schemas';
import type {
  AssistantSettingsWithChanges,
  SettingChange,
} from '../../domain/AssistantSettings';

function toChange(
  change: SettingChange | undefined
): TAssistantSettingChange | null {
  return change
    ? { changedBy: change.changedBy, changedAt: change.changedAt.toISOString() }
    : null;
}

export function toAssistantSettingsResponse({
  settings,
  changes,
}: AssistantSettingsWithChanges): TAssistantSettingsResponse {
  return {
    success: true,
    data: {
      ...settings,
      changes: {
        enabled: toChange(changes.enabled),
        simpleReplies: toChange(changes.simpleReplies),
        perContactDailyLimit: toChange(changes.perContactDailyLimit),
        debounceSeconds: toChange(changes.debounceSeconds),
        maxWaitSeconds: toChange(changes.maxWaitSeconds),
        dailyReplyLimit: toChange(changes.dailyReplyLimit),
      },
    },
  };
}
