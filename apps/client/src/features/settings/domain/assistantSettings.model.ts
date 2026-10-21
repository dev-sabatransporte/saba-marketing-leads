export type AssistantSettingKey =
  | 'enabled'
  | 'simpleReplies'
  | 'perContactDailyLimit'
  | 'debounceSeconds'
  | 'maxWaitSeconds'
  | 'dailyReplyLimit';

export interface SettingChange {
  changedByName: string;
  changedAt: Date;
}

export interface AssistantLimits {
  perContactDailyLimit: number;
  debounceSeconds: number;
  maxWaitSeconds: number;
  dailyReplyLimit: number;
}

export interface AssistantSettings extends AssistantLimits {
  enabled: boolean;
  simpleReplies: boolean;
  /** `null`: it still has its default value. */
  changes: Record<AssistantSettingKey, SettingChange | null>;
}

// The team works in Venezuela: the date is shown in its time, wherever the
// browser is.
const CHANGED_AT_FORMAT = new Intl.DateTimeFormat('es-VE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Caracas',
});

/** "Cambiado por María Gómez · 20 oct 2026, 10:30 a. m." */
export function describeChange(change: SettingChange | null): string {
  if (!change) return 'Sin cambios';
  return `Cambiado por ${change.changedByName} · ${CHANGED_AT_FORMAT.format(change.changedAt)}`;
}
