import type { Product } from '../../../domain/product';

export interface ProductCatalogPort {
  /** Throws `CatalogUnavailableError` when Saba does not answer. */
  search(query: string): Promise<Product[]>;
}
