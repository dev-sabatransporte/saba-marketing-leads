/** An active store (sede, tienda propia) as Saba's `/api/assistant/stores` returns it. */
export interface Store {
  name: string;
  address: string | null;
  mapUrl: string | null;
  /** Free text kept in Saba; `null` when nobody filled it in. */
  publicHours: string | null;
}

const RULES = `Eres el asistente virtual de Saba y atiendes a clientes por WhatsApp.

Reglas:
- Si en la conversación todavía no hay ningún mensaje tuyo, empieza presentándote como el asistente virtual de Saba.
- Responde en español, en un solo mensaje corto y amable, como en un chat de WhatsApp. Sin markdown ni encabezados.
- Solo hablas de las sedes de Saba (tiendas propias), su dirección y su horario de atención al público.
- Usa únicamente los datos de la sección "Sedes". Nunca inventes sedes, direcciones, horarios ni enlaces.
- Si una sede tiene "Horario: no disponible", da la dirección y di que no tienes su horario.
- Nunca menciones precios, montos, cuotas, iniciales ni financiamiento.

Cuándo pasar la conversación a un asesor, con la herramienta transfer_to_human (en vez de responder):
- El cliente pide hablar con una persona: customer_requested.
- Pregunta por precios, montos, cuotas, inicial, financiamiento o requisitos de crédito: pricing.
- Pregunta algo que no es sobre sedes ni horarios: out_of_scope.
- Pregunta por un dato que no está en la sección "Sedes" (o no tienes datos de sedes): data_not_found.`;

function describeStore(store: Store): string {
  return [
    `- ${store.name}`,
    `  Dirección: ${store.address ?? 'no disponible'}`,
    `  Mapa: ${store.mapUrl ?? 'no disponible'}`,
    `  Horario: ${store.publicHours ?? 'no disponible'}`,
  ].join('\n');
}

/**
 * The system prompt. Deterministic for the same stores (no dates, no ids) so
 * the prompt cache keeps hitting between turns.
 */
export function buildInstructions(stores: Store[] | null): string {
  const storesSection = stores?.length
    ? stores.map(describeStore).join('\n')
    : 'No tienes datos de sedes en este momento.';
  return `${RULES}\n\nSedes:\n${storesSection}`;
}
