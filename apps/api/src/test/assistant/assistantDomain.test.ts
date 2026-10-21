import { describe, expect, it } from 'vitest';
import {
  type ChatLine,
  isLatestCustomerMessage,
  toModelTurns,
  withinReplyWindow,
} from '../../modules/assistant/domain/conversation';
import {
  HANDOFF_NOTICE,
  handoffNotice,
  mentionsAnAmount,
} from '../../modules/assistant/domain/handoff';
import { buildInstructions } from '../../modules/assistant/domain/instructions';

let nextId = 0;
const line = (
  source: ChatLine['source'],
  body: string | null,
  type = 'text',
  status: string | null = null
): ChatLine => ({ id: `m${++nextId}`, source, type, body, status });

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

  it('tells the model to hand over with transfer_to_human, not to improvise', () => {
    const text = buildInstructions(null);
    expect(text).toContain('transfer_to_human');
    expect(text).toContain('data_not_found');
    expect(text).toContain('pricing');
    expect(text).toContain('customer_requested');
  });

  it('tells the model to decide by the latest message and to answer greetings', () => {
    const text = buildInstructions(null);
    expect(text).toContain('último mensaje del cliente');
    expect(text).toMatch(/saludo/i);
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

describe('toModelTurns with replies that did not go out', () => {
  it('leaves out a reply that failed to send', () => {
    expect(
      toModelTurns([
        line('customer', 'hola'),
        line('assistant', 'Hola, soy el asistente', 'text', 'failed'),
        line('customer', '¿siguen ahí?'),
      ])
    ).toEqual([{ role: 'user', content: 'hola\n¿siguen ahí?' }]);
  });
});

describe('toModelTurns after a handoff', () => {
  it('starts fresh after the last handoff notice: what came before was for a person', () => {
    expect(
      toModelTurns([
        line('customer', 'hola'),
        line('assistant', 'Hola, ¿en qué te ayudo?'),
        line('customer', 'Asesor'),
        line('assistant', HANDOFF_NOTICE),
        line('customer', 'Hola'),
      ])
    ).toEqual([{ role: 'user', content: 'Hola' }]);
  });

  it('also starts fresh after an out-of-stock notice', () => {
    expect(
      toModelTurns([
        line('customer', '¿tienen la Bera SBR?'),
        line('assistant', handoffNotice('out_of_stock')),
        line('customer', 'gracias'),
      ])
    ).toEqual([{ role: 'user', content: 'gracias' }]);
  });
});

describe('handoffNotice', () => {
  it('says the model is carried when it is out of stock', () => {
    expect(handoffNotice('out_of_stock')).toContain('lo manejamos');
    expect(handoffNotice('out_of_stock')).toContain('asesor');
  });

  it('is the plain notice for every other reason', () => {
    expect(handoffNotice('pricing')).toBe(HANDOFF_NOTICE);
    expect(handoffNotice('error')).toBe(HANDOFF_NOTICE);
  });
});

describe('mentionsAnAmount', () => {
  it.each([
    'Cuesta $1.200',
    'La inicial es de 300 USD',
    'Son US$ 80 al mes',
    'Bs. 4.500',
    'unos 200 dólares',
    'cuesta 1.000 bolívares',
    '50 €',
  ])('catches "%s"', (text) => {
    expect(mentionsAnAmount(text)).toBe(true);
  });

  it.each([
    'Sí, tenemos la Bera SBR 150 en stock.',
    'La sede de Catia abre de 8:00 a. m. a 5:00 p. m.',
    'Manejamos la Empire Keeway 2026',
  ])('lets "%s" through', (text) => {
    expect(mentionsAnAmount(text)).toBe(false);
  });
});

describe('isLatestCustomerMessage', () => {
  it('is true only for the customer last message', () => {
    const first = line('customer', 'hola');
    const second = line('customer', '¿dónde queda Catia?');
    const lines = [first, second, line('assistant', 'Hola')];

    expect(isLatestCustomerMessage(lines, second.id)).toBe(true);
    expect(isLatestCustomerMessage(lines, first.id)).toBe(false);
    expect(isLatestCustomerMessage([], first.id)).toBe(false);
  });

  it('ignores a reaction that came after the question', () => {
    const question = line('customer', '¿dónde queda Catia?');
    const lines = [question, line('customer', null, 'reaction')];

    expect(isLatestCustomerMessage(lines, question.id)).toBe(true);
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
