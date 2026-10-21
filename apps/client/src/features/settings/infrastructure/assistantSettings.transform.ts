import type {
  TAssistantSettingChange,
  TAssistantSettings,
} from '@repo/schemas';
import type {
  AssistantSettings,
  SettingChange,
} from '../domain/assistantSettings.model';

function toChange(dto: TAssistantSettingChange | null): SettingChange | null {
  return dto
    ? { changedByName: dto.changedBy.name, changedAt: new Date(dto.changedAt) }
    : null;
}

export function toAssistantSettingsDomain(
  dto: TAssistantSettings
): AssistantSettings {
  return {
    enabled: dto.enabled,
    simpleReplies: dto.simpleReplies,
    perContactDailyLimit: dto.perContactDailyLimit,
    debounceSeconds: dto.debounceSeconds,
    maxWaitSeconds: dto.maxWaitSeconds,
    dailyReplyLimit: dto.dailyReplyLimit,
    changes: {
      enabled: toChange(dto.changes.enabled),
      simpleReplies: toChange(dto.changes.simpleReplies),
      perContactDailyLimit: toChange(dto.changes.perContactDailyLimit),
      debounceSeconds: toChange(dto.changes.debounceSeconds),
      maxWaitSeconds: toChange(dto.changes.maxWaitSeconds),
      dailyReplyLimit: toChange(dto.changes.dailyReplyLimit),
    },
  };
}
