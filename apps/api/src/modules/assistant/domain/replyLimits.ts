const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Venezuela has no daylight saving time since 2016: always UTC-4.
const VENEZUELA_OFFSET_MS = -4 * HOUR_MS;

/** Where today's global count starts: midnight in Caracas. */
export function startOfVenezuelanDay(now: Date): Date {
  const local = now.getTime() + VENEZUELA_OFFSET_MS;
  return new Date(local - (local % DAY_MS) - VENEZUELA_OFFSET_MS);
}

/** The per-contact limit is a rolling window, not a calendar day. */
export function contactWindowStart(now: Date): Date {
  return new Date(now.getTime() - DAY_MS);
}
