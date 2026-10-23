import { venezuelanHour } from './replyLimits';

/** What the code answers on its own, without the model writing a word. */
export const FIXED_REPLIES = ['greeting', 'closing', 'pricing'] as const;
export type FixedReply = (typeof FIXED_REPLIES)[number];

export const GREETING_REPLY =
  'Puedo ayudarte con nuestros productos, nuestras sedes y sus horarios de atención. ¿Qué necesitas?';
export const CLOSING_REPLY =
  '¡Con gusto! Si necesitas algo más, escríbeme por aquí.';
export const PRICING_REPLY =
  'Los precios y las opciones de financiamiento los puedes ver en nuestra página web: www.sabatransporte.com';

const TEXTS: Record<FixedReply, string> = {
  greeting: GREETING_REPLY,
  closing: CLOSING_REPLY,
  pricing: PRICING_REPLY,
};

export function fixedReplyText(reply: FixedReply): string {
  return TEXTS[reply];
}

export function greetingFor(now: Date): string {
  const hour = venezuelanHour(now);
  if (hour >= 5 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Written by code so the customer always knows a bot is answering. */
export function introduction(now: Date): string {
  return `${greetingFor(now)}, te responde el asistente virtual de Saba Transporte 🤖.`;
}

export function withIntroduction(text: string, now: Date): string {
  return `${introduction(now)} ${text}`;
}
