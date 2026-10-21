import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { StructuredLogger } from '../../../../infrastructure/logging/StructuredLogger';
import type { ProductCatalogPort } from '../../application/ports/out/ProductCatalogPort';
import { CatalogUnavailableError } from '../../domain/AssistantErrors';
import type { Product } from '../../domain/product';
import { ASSISTANT_TOKENS } from '../../tokens';
import type { AssistantConfig } from '../assistantConfig';
import {
  getFromSabaAssistant,
  SabaConfigError,
  SabaStatusError,
} from './sabaAssistantApi';

// Saba's `/api/assistant/products` contract. Only these fields are kept, so
// nothing else Saba might add ever reaches the model.
const responseSchema = z.object({
  ok: z.literal(true),
  products: z.array(
    z.object({
      name: z.string(),
      model: z.string().nullable(),
      brand: z.string().nullable(),
      categories: z.array(z.string()),
      in_stock: z.boolean(),
    })
  ),
});

type Logger = Pick<StructuredLogger, 'warn' | 'error'>;

/** Product search on Saba's assistant endpoints. Not cached: Saba caches the stock. */
@Injectable()
export class HttpSabaAssistantProducts implements ProductCatalogPort {
  constructor(
    @Inject(ASSISTANT_TOKENS.Config)
    private readonly config: Pick<
      AssistantConfig,
      'sabaApiUrl' | 'sabaAssistantKey'
    >,
    @Inject(ASSISTANT_TOKENS.Logger) private readonly logger: Logger
  ) {}

  async search(query: string): Promise<Product[]> {
    try {
      const { products } = await getFromSabaAssistant(
        this.config,
        `/api/assistant/products?${new URLSearchParams({ search: query })}`,
        responseSchema
      );
      return products.map((p) => ({
        name: p.name,
        model: p.model,
        brand: p.brand,
        categories: p.categories,
        inStock: p.in_stock,
      }));
    } catch (error: unknown) {
      // Saba found no words to search for (`missing_search`): nothing matches.
      if (error instanceof SabaStatusError && error.status === 400) return [];
      const detail = error instanceof Error ? error.message : String(error);
      if (error instanceof SabaConfigError) {
        void this.logger.error(
          `productos del asistente: ${detail}; revisar SABA_ASSISTANT_KEY (= ASSISTANT_SERVICE_KEY de Saba)`,
          undefined,
          'Assistant'
        );
        throw new CatalogUnavailableError(true, detail);
      }
      void this.logger.warn(
        `productos del asistente: Saba no respondió (${detail})`,
        'Assistant'
      );
      throw new CatalogUnavailableError(false, detail);
    }
  }
}
