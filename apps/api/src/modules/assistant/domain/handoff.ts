/** Why the assistant hands a chat to a person (stored with the chat and the run). */
export const HANDOFF_REASONS = [
  'out_of_scope',
  'customer_requested',
  'data_not_found',
  'non_text',
  'pricing',
  'out_of_stock',
  'limit_reached',
  'error',
] as const;
export type HandoffReason = (typeof HANDOFF_REASONS)[number];

/** The ones the model may choose; the rest are decided by code. */
export const MODEL_HANDOFF_REASONS = [
  'out_of_scope',
  'customer_requested',
  'data_not_found',
  'pricing',
  'out_of_stock',
] as const satisfies readonly HandoffReason[];
export type ModelHandoffReason = (typeof MODEL_HANDOFF_REASONS)[number];

/** Fixed text, not the model's: the customer never sees a technical detail. */
export const HANDOFF_NOTICE =
  'Te paso con un asesor de Saba, en breve te escribe por aquí.';

const OUT_OF_STOCK_NOTICE =
  'Ese modelo sí lo manejamos, pero ahora mismo no tenemos stock. Te paso con un asesor de Saba, en breve te escribe por aquí.';

/** What the customer reads when the chat goes to a person. */
export function handoffNotice(reason: HandoffReason): string {
  return reason === 'out_of_stock' ? OUT_OF_STOCK_NOTICE : HANDOFF_NOTICE;
}

export function isHandoffNotice(body: string | null): boolean {
  return body === HANDOFF_NOTICE || body === OUT_OF_STOCK_NOTICE;
}

// A currency sign or name next to an amount. Plain numbers stay allowed:
// model names ("SBR 150") and hours ("8:00") are full of them.
const AMOUNT =
  /\$|€|\bUSD\b|\bBs\.?\s?\d|\d\s?Bs\b|\bd[oó]lar(es)?\b|\bbol[ií]var(es)?\b|\beuros?\b/i;

/**
 * Saba never gives the assistant an amount, so any amount in a reply is made
 * up. Checked in code too: the instructions alone are not a guarantee.
 */
export function mentionsAnAmount(text: string): boolean {
  return AMOUNT.test(text);
}
