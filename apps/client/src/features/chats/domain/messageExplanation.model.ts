import type { TAssistantHandoffReason } from '@repo/schemas';

export type HandoffReason = TAssistantHandoffReason;

export interface ProductSearch {
  query: string;
  /** `null` if Saba did not answer the search. */
  resultCount: number | null;
}

/** What the assistant did to write a message: its searches and, if it handed over, why. */
export interface MessageExplanation {
  handoffReason: HandoffReason | null;
  searches: ProductSearch[];
}

// `limit_reached` keeps its Spanish code: the team already calls it that.
const HANDOFF_REASON_LABELS: Record<HandoffReason, string> = {
  out_of_scope: 'el tema no es de productos, sedes u horarios',
  customer_requested: 'el cliente pidió hablar con una persona',
  data_not_found: 'no encontró el dato',
  non_text: 'el cliente envió algo que no es texto',
  pricing: 'preguntó por precio o financiamiento',
  out_of_stock: 'el modelo no tiene stock',
  limit_reached:
    'limite_alcanzado (el cliente llegó al tope de respuestas del día)',
  error: 'falló algo técnico',
};

export function outcomeLabel(explanation: MessageExplanation): string {
  return explanation.handoffReason
    ? `Traspasó a un asesor: ${HANDOFF_REASON_LABELS[explanation.handoffReason]}`
    : 'Respondió al cliente';
}

/**
 * Stores and hours travel in the assistant's instructions, not as a search:
 * an answer without searches could only use them.
 */
export function noSearchesLabel(explanation: MessageExplanation): string {
  return explanation.handoffReason
    ? 'No buscó productos.'
    : 'No buscó productos: respondió solo con las sedes y horarios que tiene cargados.';
}

export function resultsLabel(resultCount: number | null): string {
  if (resultCount === null) return 'Saba no respondió';
  return resultCount === 1 ? '1 resultado' : `${resultCount} resultados`;
}
