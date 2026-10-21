import { z } from 'zod';

/** `VAR=` in `.env` counts as undefined: `.env` ships blank whatever is unused. */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional()
  );
}

const assistantEnvSchema = z.object({
  SABA_API_URL: optional(z.url()),
  SABA_ASSISTANT_KEY: optional(z.string().min(1)),
  ASSISTANT_ANTHROPIC_API_KEY: optional(z.string().min(1)),
  ASSISTANT_MODEL: optional(z.string().min(1)),
});

export const DEFAULT_ASSISTANT_MODEL = 'claude-sonnet-5-5';

export interface AssistantConfig {
  /** Base URL of Saba's Node server, without `/api`. */
  sabaApiUrl: string | null;
  /** Same value as Saba's `ASSISTANT_SERVICE_KEY`; not the marketing key. */
  sabaAssistantKey: string | null;
  /** Its own key, in its own Anthropic workspace with a spend limit. */
  anthropicApiKey: string | null;
  model: string;
}

/**
 * Does not fail at startup: the assistant ships off, and the rest of the panel
 * must work without it. A turn without configuration fails and is recorded.
 */
export function loadAssistantConfig(
  env: NodeJS.ProcessEnv = process.env
): AssistantConfig {
  const parsed = assistantEnvSchema.parse(env);
  return {
    sabaApiUrl: parsed.SABA_API_URL?.replace(/\/+$/, '') ?? null,
    sabaAssistantKey: parsed.SABA_ASSISTANT_KEY ?? null,
    anthropicApiKey: parsed.ASSISTANT_ANTHROPIC_API_KEY ?? null,
    model: parsed.ASSISTANT_MODEL ?? DEFAULT_ASSISTANT_MODEL,
  };
}
