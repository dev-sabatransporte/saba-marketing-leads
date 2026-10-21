/** An active product as Saba's `/api/assistant/products` returns it: never an amount. */
export interface Product {
  name: string;
  model: string | null;
  brand: string | null;
  categories: string[];
  inStock: boolean;
}
