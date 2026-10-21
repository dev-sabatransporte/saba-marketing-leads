import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { StructuredLogger } from '../../../../infrastructure/logging/StructuredLogger';
import type { ClockPort } from '../../application/ports/out/ClockPort';
import type {
  StoresSnapshot,
  StoresSourcePort,
} from '../../application/ports/out/StoresSourcePort';
import type { Store } from '../../domain/instructions';
import { ASSISTANT_TOKENS } from '../../tokens';
import type { AssistantConfig } from '../assistantConfig';

const TIMEOUT_MS = 5_000;
const FRESH_MS = 5 * 60 * 1000;
// While Saba fails, each turn would otherwise wait the full timeout.
const RETRY_AFTER_FAILURE_MS = 60 * 1000;

// Saba's `/api/assistant/stores` contract, mapped to this module's domain.
const responseSchema = z.object({
  ok: z.literal(true),
  stores: z.array(
    z.object({
      name: z.string(),
      address: z.string().nullable(),
      map_url: z.string().nullable(),
      public_hours: z.string().nullable(),
    })
  ),
});

type Logger = Pick<StructuredLogger, 'warn' | 'error'>;

/** Missing or rejected assistant key: configuration, not an outage. */
class SabaConfigError extends Error {}

/**
 * Active stores from Saba's assistant endpoints (own key, never the marketing
 * one). Cached in memory: the stores go into every prompt, and they change
 * rarely.
 */
@Injectable()
export class HttpSabaAssistantStores implements StoresSourcePort {
  private stores: Store[] | null = null;
  private loadedAt = 0;
  private failedAt = 0;
  // A rejected key does not fix itself: no more calls until a restart with the right key.
  private misconfigured = false;

  constructor(
    @Inject(ASSISTANT_TOKENS.Config)
    private readonly config: Pick<
      AssistantConfig,
      'sabaApiUrl' | 'sabaAssistantKey'
    >,
    @Inject(ASSISTANT_TOKENS.Clock) private readonly clock: ClockPort,
    @Inject(ASSISTANT_TOKENS.Logger) private readonly logger: Logger
  ) {}

  async current(): Promise<StoresSnapshot> {
    const now = this.clock.now().getTime();
    const fresh = this.stores !== null && now - this.loadedAt < FRESH_MS;
    const coolingDown = now - this.failedAt < RETRY_AFTER_FAILURE_MS;
    if (!this.misconfigured && !fresh && !coolingDown) {
      try {
        this.stores = await this.fetchStores();
        this.loadedAt = now;
      } catch (error: unknown) {
        this.failedAt = now;
        if (error instanceof SabaConfigError) this.misconfigured = true;
        this.report(error);
      }
    }
    return { stores: this.stores, misconfigured: this.misconfigured };
  }

  private async fetchStores(): Promise<Store[]> {
    const { sabaApiUrl, sabaAssistantKey } = this.config;
    if (!sabaApiUrl || !sabaAssistantKey) {
      throw new SabaConfigError('faltan SABA_API_URL o SABA_ASSISTANT_KEY');
    }
    const response = await fetch(
      new URL(`${sabaApiUrl}/api/assistant/stores`),
      {
        headers: { 'X-Saba-Assistant-Key': sabaAssistantKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (response.status === 401) {
      throw new SabaConfigError('Saba rechazó la llave del asistente');
    }
    if (!response.ok) throw new Error(`Saba respondió ${response.status}`);
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('respuesta inesperada de Saba');
    return parsed.data.stores.map((s) => ({
      name: s.name,
      address: s.address,
      mapUrl: s.map_url,
      publicHours: s.public_hours,
    }));
  }

  private report(error: unknown): void {
    if (error instanceof SabaConfigError) {
      // Configuration, not an outage: it is not retried, the chat goes to a person.
      void this.logger.error(
        `sedes del asistente: ${error.message}; revisar SABA_ASSISTANT_KEY (= ASSISTANT_SERVICE_KEY de Saba)`,
        undefined,
        'Assistant'
      );
      return;
    }
    const detail = error instanceof Error ? error.message : String(error);
    void this.logger.warn(
      `sedes del asistente: Saba no respondió (${detail}); se usa la última copia`,
      'Assistant'
    );
  }
}
