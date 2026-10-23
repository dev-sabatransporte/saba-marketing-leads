import { ASSISTANT_HANDOFF_REASONS } from '@repo/schemas';

/** Why the assistant hands a chat to a person (stored with the chat and the run). */
export const HANDOFF_REASONS = ASSISTANT_HANDOFF_REASONS;
export type HandoffReason = (typeof HANDOFF_REASONS)[number];

export function isHandoffReason(value: string | null): value is HandoffReason {
  return HANDOFF_REASONS.some((reason) => reason === value);
}

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

/** Also with the introduction in front, as the first reply of a chat. */
export function isHandoffNotice(body: string | null): boolean {
  return (
    !!body &&
    (body.endsWith(HANDOFF_NOTICE) || body.endsWith(OUT_OF_STOCK_NOTICE))
  );
}

// A currency sign or name, or a number next to a payment word. Plain numbers
// stay allowed: model names ("SBR 150") and hours ("8:00") are full of them.
const CURRENCY =
  /\$|€|\bUSD\b|\bBs\.?\s?\d|\d\s?Bs\b|\bd[oó]lar(es)?\b|\bbol[ií]var(es)?\b|\beuros?\b/i;
const PAYMENT_WORD =
  '(precios?|inicial(es)?|cuotas?|financiamiento|financiad[oa]s?|mensual(es|idad)?|al mes|pagas?|abonos?)';
const PAYMENT_AMOUNT = new RegExp(
  `\\b${PAYMENT_WORD}\\b[^.\\n]{0,30}\\d|\\d[^.\\n]{0,15}\\b${PAYMENT_WORD}\\b`,
  'i'
);

/**
 * Saba never gives the assistant an amount, so any amount in a reply is made
 * up. Checked in code too: the instructions alone are not a guarantee.
 */
export function mentionsAnAmount(text: string): boolean {
  return CURRENCY.test(text) || PAYMENT_AMOUNT.test(text);
}
