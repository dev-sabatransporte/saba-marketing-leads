import type { TAssistantHandoffReason } from '@repo/schemas';

export type HandoffReason = TAssistantHandoffReason;

export interface HandoffCount {
  reason: HandoffReason;
  count: number;
}

export interface WeeklySummary {
  from: Date;
  to: Date;
  conversations: number;
  resolvedWithoutPerson: number;
  /** Only the reasons that happened, most frequent first. */
  handoffs: HandoffCount[];
  estimatedCostUsd: number;
  /** Their tokens are not in the cost. */
  unpricedModels: string[];
}

// `limit_reached` keeps its Spanish code: the team already calls it that.
const HANDOFF_REASON_LABELS: Record<HandoffReason, string> = {
  out_of_scope: 'Fuera de alcance',
  customer_requested: 'Pidió una persona',
  data_not_found: 'Dato no encontrado',
  non_text: 'Mensaje que no es texto',
  pricing: 'Precio o financiamiento',
  out_of_stock: 'Sin stock',
  limit_reached: 'limite_alcanzado',
  error: 'Error técnico',
};

export function handoffReasonLabel(reason: HandoffReason): string {
  return HANDOFF_REASON_LABELS[reason];
}

const PERCENT_FORMAT = new Intl.NumberFormat('es-VE', {
  style: 'percent',
  maximumFractionDigits: 0,
});

/** "65 %"; "—" without chats, where a rate means nothing. */
export function resolvedRateLabel(summary: WeeklySummary): string {
  if (summary.conversations === 0) return '—';
  return PERCENT_FORMAT.format(
    summary.resolvedWithoutPerson / summary.conversations
  );
}

const USD_FORMAT = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "US$ 1,23": the team reads amounts the Venezuelan way. */
export function costLabel(usd: number): string {
  return `US$ ${USD_FORMAT.format(usd)}`;
}

const DAY_FORMAT = new Intl.DateTimeFormat('es-VE', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Caracas',
});

/** "14 oct – 21 oct", in Venezuelan time. */
export function windowLabel(summary: WeeklySummary): string {
  return `${DAY_FORMAT.format(summary.from)} – ${DAY_FORMAT.format(summary.to)}`;
}
