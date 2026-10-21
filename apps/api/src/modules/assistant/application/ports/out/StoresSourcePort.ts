import type { Store } from '../../../domain/instructions';

export interface StoresSnapshot {
  /** The last good copy; `null` if they were never loaded. */
  stores: Store[] | null;
  /** Saba rejected the assistant key (or it is missing): not an outage, a person must fix it. */
  misconfigured: boolean;
}

export interface StoresSourcePort {
  /** Refreshed from Saba when stale, the last good copy if Saba fails. Never throws. */
  current(): Promise<StoresSnapshot>;
}
