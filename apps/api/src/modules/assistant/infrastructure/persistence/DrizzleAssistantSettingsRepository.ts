import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import {
  type ApiDb,
  DRIZZLE_CLIENT,
} from '../../../../infrastructure/database/drizzle.module';
import type { ManagedAssistantSettingsRepositoryPort } from '../../application/ports/out/AssistantSettingsRepositoryPort';
import {
  type AssistantSettingKey,
  type AssistantSettings,
  type AssistantSettingsWithChanges,
  DEFAULT_ASSISTANT_SETTINGS,
  type SettingChange,
  type SettingChanges,
} from '../../domain/AssistantSettings';
import {
  assistantSettings,
  type StoredSettingChanges,
} from './assistant.schema';

const SETTING_COLUMNS = {
  enabled: true,
  perContactDailyLimit: true,
  debounceSeconds: true,
  maxWaitSeconds: true,
  dailyReplyLimit: true,
  simpleReplies: true,
} as const;

function toSettings(row: AssistantSettings): AssistantSettings {
  return {
    enabled: row.enabled,
    perContactDailyLimit: row.perContactDailyLimit,
    debounceSeconds: row.debounceSeconds,
    maxWaitSeconds: row.maxWaitSeconds,
    dailyReplyLimit: row.dailyReplyLimit,
    simpleReplies: row.simpleReplies,
  };
}

function toChanges(stored: StoredSettingChanges): SettingChanges {
  const changes: SettingChanges = {};
  for (const key of Object.keys(DEFAULT_ASSISTANT_SETTINGS)) {
    const change = stored[key];
    if (change) {
      changes[key as AssistantSettingKey] = {
        changedBy: change.changedBy,
        changedAt: new Date(change.changedAt),
      };
    }
  }
  return changes;
}

@Injectable()
export class DrizzleAssistantSettingsRepository
  implements ManagedAssistantSettingsRepositoryPort
{
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: ApiDb) {}

  async get(): Promise<AssistantSettings> {
    const row = await this.db.query.assistantSettings.findFirst({
      columns: SETTING_COLUMNS,
    });
    return row ?? DEFAULT_ASSISTANT_SETTINGS;
  }

  async getWithChanges(): Promise<AssistantSettingsWithChanges> {
    const row = await this.db.query.assistantSettings.findFirst({
      columns: { ...SETTING_COLUMNS, changes: true },
    });
    if (!row) return { settings: DEFAULT_ASSISTANT_SETTINGS, changes: {} };
    return { settings: toSettings(row), changes: toChanges(row.changes) };
  }

  async save(
    settings: AssistantSettings,
    changed: AssistantSettingKey[],
    change: SettingChange
  ): Promise<AssistantSettingsWithChanges> {
    const stored = {
      changedBy: change.changedBy,
      changedAt: change.changedAt.toISOString(),
    };
    const newChanges: StoredSettingChanges = Object.fromEntries(
      changed.map((key) => [key, stored])
    );
    // The row may not exist yet (it starts from the defaults): an upsert. The
    // changes are merged with `||` so the other settings keep their author.
    const [row] = await this.db
      .insert(assistantSettings)
      .values({
        ...settings,
        changes: newChanges,
        updatedBy: change.changedBy.id,
        updatedAt: change.changedAt,
      })
      .onConflictDoUpdate({
        target: assistantSettings.id,
        set: {
          ...settings,
          changes: sql`${assistantSettings.changes} || excluded.changes`,
          updatedBy: change.changedBy.id,
          updatedAt: change.changedAt,
        },
      })
      .returning();
    if (!row) throw new Error('assistant_settings upsert returned no row');
    return { settings: toSettings(row), changes: toChanges(row.changes) };
  }
}
