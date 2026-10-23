import { MAX_WAIT_BELOW_DEBOUNCE_MESSAGE } from '@repo/schemas';

export const assistantMessages = {
  ASSISTANT_MAX_WAIT_BELOW_DEBOUNCE: MAX_WAIT_BELOW_DEBOUNCE_MESSAGE,
  ASSISTANT_MESSAGE_EXPLANATION_NOT_FOUND:
    'No hay detalle de este mensaje: no lo envió el asistente.',
} as const;
