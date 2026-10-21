import type { z } from 'zod';
import type { AssistantConfig } from '../assistantConfig';

const TIMEOUT_MS = 5_000;

/** Missing or rejected assistant key: configuration, not an outage. */
export class SabaConfigError extends Error {}

/** Saba answered with an error status other than 401. */
export class SabaStatusError extends Error {
  constructor(readonly status: number) {
    super(`Saba respondió ${status}`);
  }
}

/**
 * GET on Saba's assistant endpoints with the assistant key (never the
 * marketing one). Throws `SabaConfigError` on a 401 or missing configuration,
 * `SabaStatusError` on any other error status, and a plain `Error` on anything else that is not the expected answer.
 */
export async function getFromSabaAssistant<T>(
  config: Pick<AssistantConfig, 'sabaApiUrl' | 'sabaAssistantKey'>,
  path: string,
  schema: z.ZodType<T>
): Promise<T> {
  const { sabaApiUrl, sabaAssistantKey } = config;
  if (!sabaApiUrl || !sabaAssistantKey) {
    throw new SabaConfigError('faltan SABA_API_URL o SABA_ASSISTANT_KEY');
  }
  const response = await fetch(new URL(`${sabaApiUrl}${path}`), {
    headers: { 'X-Saba-Assistant-Key': sabaAssistantKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 401) {
    throw new SabaConfigError('Saba rechazó la llave del asistente');
  }
  if (!response.ok) throw new SabaStatusError(response.status);
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new Error('respuesta inesperada de Saba');
  return parsed.data;
}
