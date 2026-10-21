import type { Store } from '../../../domain/instructions';

export interface StoresSourcePort {
  /**
   * The latest stores known: refreshed from Saba when stale, the last good
   * copy if Saba fails, `null` if they were never loaded. Never throws.
   */
  current(): Promise<Store[] | null>;
}
