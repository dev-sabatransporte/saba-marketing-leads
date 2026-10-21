import { z } from 'zod';
import { buildSafeResponseSchema } from '../utils';

/**
 * Allowed range of each numeric setting. Wide enough to tune cost and
 * behavior, narrow enough that a typo cannot leave the assistant answering
 * thousands of times a day or making a customer wait for minutes.
 */
export const ASSISTANT_SETTINGS_RANGES = {
  perContactDailyLimit: { min: 1, max: 100 },
  debounceSeconds: { min: 0, max: 60 },
  maxWaitSeconds: { min: 1, max: 300 },
  dailyReplyLimit: { min: 1, max: 5000 },
} as const;

export const ASSISTANT_SETTING_KEYS = [
  'enabled',
  'simpleReplies',
  'perContactDailyLimit',
  'debounceSeconds',
  'maxWaitSeconds',
  'dailyReplyLimit',
] as const;
export const assistantSettingKeySchema = z.enum(ASSISTANT_SETTING_KEYS);
export type TAssistantSettingKey = z.infer<typeof assistantSettingKeySchema>;

export const MAX_WAIT_BELOW_DEBOUNCE_MESSAGE =
  'La espera máxima no puede ser menor que la espera.';

function ranged(key: keyof typeof ASSISTANT_SETTINGS_RANGES) {
  const { min, max } = ASSISTANT_SETTINGS_RANGES[key];
  return z
    .number('Escribe un número.')
    .int('Escribe un número entero.')
    .min(min, `El mínimo es ${min}.`)
    .max(max, `El máximo es ${max}.`);
}

const settingsValuesShape = {
  enabled: z.boolean(),
  /** Shortest possible answers and a low output cap, to spend fewer tokens. */
  simpleReplies: z.boolean(),
  perContactDailyLimit: ranged('perContactDailyLimit'),
  debounceSeconds: ranged('debounceSeconds'),
  maxWaitSeconds: ranged('maxWaitSeconds'),
  dailyReplyLimit: ranged('dailyReplyLimit'),
};

/** Who changed a setting and when; `null` while it keeps its default. */
export const assistantSettingChangeSchema = z.object({
  changedBy: z.object({ id: z.string(), name: z.string() }),
  changedAt: z.string(),
});
export type TAssistantSettingChange = z.infer<
  typeof assistantSettingChangeSchema
>;

export const assistantSettingsSchema = z.object({
  ...settingsValuesShape,
  changes: z.object({
    enabled: assistantSettingChangeSchema.nullable(),
    simpleReplies: assistantSettingChangeSchema.nullable(),
    perContactDailyLimit: assistantSettingChangeSchema.nullable(),
    debounceSeconds: assistantSettingChangeSchema.nullable(),
    maxWaitSeconds: assistantSettingChangeSchema.nullable(),
    dailyReplyLimit: assistantSettingChangeSchema.nullable(),
  }),
});
export type TAssistantSettings = z.infer<typeof assistantSettingsSchema>;

export const assistantSettingsResponseSchema = buildSafeResponseSchema(
  assistantSettingsSchema
);
export type TAssistantSettingsResponse = z.infer<
  typeof assistantSettingsResponseSchema
>;

/**
 * Body of `PATCH /assistant/settings`: only the settings being changed.
 * `maxWaitSeconds >= debounceSeconds` is checked by the API against the stored
 * values, since a patch may carry only one of the two.
 */
export const updateAssistantSettingsSchema = z
  .strictObject(settingsValuesShape)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'No hay ningún ajuste para cambiar.',
  });
export type TUpdateAssistantSettings = z.infer<
  typeof updateAssistantSettingsSchema
>;

/** The four limits the panel edits together in one form. */
export const assistantLimitsSchema = z
  .object({
    perContactDailyLimit: settingsValuesShape.perContactDailyLimit,
    debounceSeconds: settingsValuesShape.debounceSeconds,
    maxWaitSeconds: settingsValuesShape.maxWaitSeconds,
    dailyReplyLimit: settingsValuesShape.dailyReplyLimit,
  })
  .refine((limits) => limits.maxWaitSeconds >= limits.debounceSeconds, {
    message: MAX_WAIT_BELOW_DEBOUNCE_MESSAGE,
    path: ['maxWaitSeconds'],
  });
export type TAssistantLimits = z.infer<typeof assistantLimitsSchema>;
