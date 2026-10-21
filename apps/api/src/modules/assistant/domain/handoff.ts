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
