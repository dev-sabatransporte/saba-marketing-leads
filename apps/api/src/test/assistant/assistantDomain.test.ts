import { describe, expect, it } from 'vitest';
import {
  type ChatLine,
  toModelTurns,
  withinReplyWindow,
} from '../../modules/assistant/domain/conversation';
import { buildInstructions } from '../../modules/assistant/domain/instructions';

const line = (
  source: ChatLine['source'],
  body: string | null,
  type = 'text'
): ChatLine => ({ source, type, body });

describe('buildInstructions', () => {
  it('lists every store with its address, map and hours', () => {
    const text = buildInstructions([
      {
        name: 'Catia',
        address: 'Av. Sucre',
        mapUrl: 'https://maps.app.goo.gl/x',
        publicHours: 'Lunes a viernes 8:00 a. m. a 5:00 p. m.',
      },
    ]);

    expect(text).toContain('asistente virtual de Saba');
    expect(text).toContain('Catia');
    expect(text).toContain('Av. Sucre');
    expect(text).toContain('https://maps.app.goo.gl/x');
    expect(text).toContain('Lunes a viernes 8:00 a. m. a 5:00 p. m.');
  });

  it('says plainly when a store has no hours, so the model does not invent them', () => {
    const text = buildInstructions([
      { name: 'Iglesia', address: 'Calle 1', mapUrl: null, publicHours: null },
    ]);

    expect(text).toMatch(/Iglesia[\s\S]*Horario: no disponible/);
  });

  it('without stores it tells the model it has no store data', () => {
    expect(buildInstructions(null)).toContain('No tienes datos de sedes');
  });

  it('is the same text for the same stores, so the prompt cache hits', () => {
    const stores = [
      { name: 'Catia', address: null, mapUrl: null, publicHours: null },
    ];
    expect(buildInstructions(stores)).toBe(buildInstructions(stores));
  });
});

describe('toModelTurns', () => {
  it('maps customer to user and assistant to assistant, joining consecutive lines', () => {
    expect(
      toModelTurns([
        line('customer', 'hola'),
        line('customer', '¿dónde queda Catia?'),
        line('assistant', 'Queda en la Av. Sucre'),
        line('customer', 'gracias'),
      ])
    ).toEqual([
      { role: 'user', content: 'hola\n¿dónde queda Catia?' },
      { role: 'assistant', content: 'Queda en la Av. Sucre' },
      { role: 'user', content: 'gracias' },
    ]);
  });

  it('leaves out panel messages, non-text messages and leading assistant lines', () => {
    expect(
      toModelTurns([
        line('assistant', 'mensaje viejo'),
        line('customer', null, 'image'),
        line('system', 'te atiende Ana'),
        line('customer', 'hola'),
      ])
    ).toEqual([{ role: 'user', content: 'hola' }]);
  });

  it('is empty when the last line is not the customer: nothing to answer', () => {
    expect(
      toModelTurns([line('customer', 'hola'), line('assistant', 'Hola')])
    ).toEqual([]);
  });
});

describe('withinReplyWindow', () => {
  const now = new Date('2026-10-21T15:00:00Z');

  it('is open for 24 h after the last customer message', () => {
    expect(withinReplyWindow(new Date('2026-10-20T15:00:01Z'), now)).toBe(true);
    expect(withinReplyWindow(new Date('2026-10-20T15:00:00Z'), now)).toBe(
      false
    );
    expect(withinReplyWindow(null, now)).toBe(false);
  });
});
