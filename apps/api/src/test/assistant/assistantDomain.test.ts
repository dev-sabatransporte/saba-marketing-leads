import { describe, expect, it } from 'vitest';
import {
  type ChatLine,
  toModelTurns,
  withinReplyWindow,
} from '../../modules/assistant/domain/conversation';
import {
  HANDOFF_NOTICE,
  handoffNotice,
  mentionsAnAmount,
} from '../../modules/assistant/domain/handoff';
import {
  buildInstructions,
  type Store,
} from '../../modules/assistant/domain/instructions';
import { withMapLinks } from '../../modules/assistant/domain/mapLinks';
import { addToBatch } from '../../modules/assistant/domain/pendingReply';
import {
  contactWindowStart,
  startOfVenezuelanDay,
} from '../../modules/assistant/domain/replyLimits';

let nextId = 0;
const line = (
  source: ChatLine['source'],
  body: string | null,
  type = 'text',
  status: string | null = null
): ChatLine => ({ id: `m${++nextId}`, source, type, body, status });

describe('buildInstructions', () => {
  const PLAIN = { simpleReplies: false };
  const SIMPLE = { simpleReplies: true };

  it('lists every store with its address and hours, never its map link', () => {
    const text = buildInstructions(
      [
        {
          name: 'Catia',
          address: 'Av. Sucre',
          mapUrl: 'https://maps.app.goo.gl/x',
          publicHours: 'Lunes a viernes 8:00 a. m. a 5:00 p. m.',
        },
      ],
      PLAIN
    );

    expect(text).toContain('asistente virtual de Saba');
    expect(text).toContain('Catia');
    expect(text).toContain('Av. Sucre');
    expect(text).toContain('Lunes a viernes 8:00 a. m. a 5:00 p. m.');
    expect(text).not.toContain('https://maps.app.goo.gl/x');
    expect(text).not.toContain('Mapa:');
  });

  it('tells the model to always name the store, so code can add its map link', () => {
    expect(buildInstructions(null, PLAIN)).toContain(
      'Menciona siempre la sede por su nombre'
    );
  });

  it('says plainly when a store has no hours, so the model does not invent them', () => {
    const text = buildInstructions(
      [
        {
          name: 'Iglesia',
          address: 'Calle 1',
          mapUrl: null,
          publicHours: null,
        },
      ],
      PLAIN
    );

    expect(text).toMatch(/Iglesia[\s\S]*Horario: no disponible/);
  });

  it('without stores it tells the model it has no store data', () => {
    expect(buildInstructions(null, PLAIN)).toContain(
      'No tienes datos de sedes'
    );
  });

  it('tells the model to hand over with transfer_to_human, not to improvise', () => {
    const text = buildInstructions(null, PLAIN);
    expect(text).toContain('transfer_to_human');
    expect(text).toContain('data_not_found');
    expect(text).toContain('pricing');
    expect(text).toContain('customer_requested');
  });

  it('tells the model to search products and to answer only with what comes back', () => {
    const text = buildInstructions(null, PLAIN);
    expect(text).toContain('search_products');
    expect(text).toContain('in_stock');
    expect(text).toContain('out_of_stock');
    expect(text).toMatch(/nunca[^\n]*de memoria/i);
  });

  it('tells the model it can search by category and that 10 results are never the whole catalog', () => {
    const text = buildInstructions(null, PLAIN);
    expect(text).toMatch(/categoría, como "motos"/);
    expect(text).toMatch(
      /como ejemplos y nunca digas que es la lista completa/
    );
  });

  it('hands over every question about price, down payment, instalments or credit', () => {
    const text = buildInstructions(null, PLAIN);
    for (const word of [
      'precio',
      'inicial',
      'cuotas',
      'financiamiento',
      'crédito',
    ]) {
      expect(text).toContain(word);
    }
  });

  it('tells the model to decide by the latest message and to answer greetings', () => {
    const text = buildInstructions(null, PLAIN);
    expect(text).toContain('último mensaje del cliente');
    expect(text).toMatch(/saludo/i);
  });

  it('adds the brevity rules only with simple replies on', () => {
    const simple = buildInstructions(null, SIMPLE);
    const plain = buildInstructions(null, PLAIN);

    for (const rule of [
      'Responde solo lo que te preguntaron, en 1 o 2 frases',
      'Preséntate solo en tu primer mensaje',
      'Sin listas largas: si preguntan por las sedes en general, nómbralas y pregunta cuál le interesa',
      'No repitas datos que ya diste',
    ]) {
      expect(simple).toContain(rule);
      expect(plain).not.toContain(rule);
    }
  });

  it.each([PLAIN, SIMPLE])(
    'is the same text for the same stores and setting %o, so the prompt cache hits',
    (setting) => {
      const stores = [
        { name: 'Catia', address: null, mapUrl: null, publicHours: null },
      ];
      expect(buildInstructions(stores, setting)).toBe(
        buildInstructions(stores, setting)
      );
    }
  );
});

describe('toModelTurns', () => {
  it('puts the batch last: a reply written before it arrived did not answer it', () => {
    const hola = line('customer', 'hola');
    const late = line('customer', '¿y Catia?');

    expect(
      toModelTurns(
        [hola, late, line('assistant', 'Hola, ¿en qué te ayudo?')],
        [late.id]
      )
    ).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'Hola, ¿en qué te ayudo?' },
      { role: 'user', content: '¿y Catia?' },
    ]);
  });

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
    'la inicial es de 300',
    '12 cuotas de 80',
    'el precio es 1.200',
    'financiamiento a 24 meses con 40 al mes',
    'pagas 80 mensuales',
  ])('catches "%s"', (text) => {
    expect(mentionsAnAmount(text)).toBe(true);
  });

  it.each([
    'Sí, tenemos la Bera SBR 150 en stock.',
    'La sede de Catia abre de 8:00 a. m. a 5:00 p. m.',
    'Manejamos la Empire Keeway 2026',
    'Tenemos la Bera SBR 150 y la Bera BR 200 en stock.',
    'La sede de Catia queda en la calle 5, local 12.',
  ])('lets "%s" through', (text) => {
    expect(mentionsAnAmount(text)).toBe(false);
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

describe('withMapLinks', () => {
  const store = (name: string, mapUrl: string | null): Store => ({
    name,
    address: null,
    mapUrl,
    publicHours: null,
  });
  const CATIA = store('Catia', 'https://maps.app.goo.gl/catia');
  const PETARE = store('Petare', 'https://maps.app.goo.gl/petare');
  const LOS_TEQUES = store('Los Teques', 'https://maps.app.goo.gl/teques');
  const MARACAY = store('Maracay', 'https://maps.app.goo.gl/maracay');
  const IGLESIA = store('Iglesia', null);

  it('adds the map line of the store the reply names', () => {
    expect(
      withMapLinks('La sede de Catia abre de 8:00 a 5:00.', [CATIA, PETARE])
    ).toBe(
      'La sede de Catia abre de 8:00 a 5:00.\n\n📍 Catia: https://maps.app.goo.gl/catia'
    );
  });

  it('finds the name without minding accents or case', () => {
    const merida = store('Mérida', 'https://maps.app.goo.gl/merida');

    expect(withMapLinks('En MERIDA abrimos a las 8.', [merida])).toContain(
      '📍 Mérida: https://maps.app.goo.gl/merida'
    );
    expect(withMapLinks('en catía abrimos a las 8.', [CATIA])).toContain(
      '📍 Catia: https://maps.app.goo.gl/catia'
    );
  });

  it('matches whole names only', () => {
    expect(withMapLinks('Catiana no es una sede.', [CATIA])).toBe(
      'Catiana no es una sede.'
    );
  });

  it('does not take a store whose name is inside a longer one the reply names', () => {
    const catiaLaMar = store('Catia La Mar', 'https://maps.app.goo.gl/lamar');

    expect(
      withMapLinks('Catia La Mar abre a las 8.', [CATIA, catiaLaMar])
    ).toBe(
      'Catia La Mar abre a las 8.\n\n📍 Catia La Mar: https://maps.app.goo.gl/lamar'
    );
    expect(
      withMapLinks('Catia y Catia La Mar abren a las 8.', [CATIA, catiaLaMar])
    ).toContain('📍 Catia: https://maps.app.goo.gl/catia\n📍 Catia La Mar');
  });

  it('leaves the reply alone when it names no store', () => {
    expect(withMapLinks('Sí, tenemos la Bera SBR 150.', [CATIA])).toBe(
      'Sí, tenemos la Bera SBR 150.'
    );
    expect(withMapLinks('Catia queda en la Av. Sucre.', null)).toBe(
      'Catia queda en la Av. Sucre.'
    );
  });

  it('adds one line per store named, once each', () => {
    expect(
      withMapLinks('Catia y Los Teques abren a las 8; Catia cierra a las 5.', [
        CATIA,
        PETARE,
        LOS_TEQUES,
      ])
    ).toBe(
      'Catia y Los Teques abren a las 8; Catia cierra a las 5.\n\n' +
        '📍 Catia: https://maps.app.goo.gl/catia\n' +
        '📍 Los Teques: https://maps.app.goo.gl/teques'
    );
  });

  it('adds none when the reply names more than 3 stores', () => {
    const text = 'Tenemos sedes en Catia, Petare, Los Teques y Maracay.';
    expect(withMapLinks(text, [CATIA, PETARE, LOS_TEQUES, MARACAY])).toBe(text);
  });

  it('adds no line for a store without a map', () => {
    expect(
      withMapLinks('Iglesia y Catia abren a las 8.', [IGLESIA, CATIA])
    ).toBe(
      'Iglesia y Catia abren a las 8.\n\n📍 Catia: https://maps.app.goo.gl/catia'
    );
  });
});

describe('reply limits', () => {
  it('counts the global limit per calendar day in Venezuela (UTC-4)', () => {
    // 03:59 UTC is still the previous day in Caracas.
    expect(startOfVenezuelanDay(new Date('2026-10-22T03:59:00Z'))).toEqual(
      new Date('2026-10-21T04:00:00Z')
    );
    expect(startOfVenezuelanDay(new Date('2026-10-22T04:00:00Z'))).toEqual(
      new Date('2026-10-22T04:00:00Z')
    );
    expect(startOfVenezuelanDay(new Date('2026-10-22T23:30:00Z'))).toEqual(
      new Date('2026-10-22T04:00:00Z')
    );
  });

  it('counts the per-contact limit over the last 24 h', () => {
    expect(contactWindowStart(new Date('2026-10-22T15:00:00Z'))).toEqual(
      new Date('2026-10-21T15:00:00Z')
    );
  });
});

describe('addToBatch', () => {
  const WAIT = { debounceSeconds: 8, maxWaitSeconds: 30 };
  const EMPTY = { messageIds: [], firstPendingAt: null, dueAt: null };
  const at = (seconds: number) =>
    new Date(Date.parse('2026-10-22T15:00:00Z') + seconds * 1000);

  it('starts a batch and answers it 8 s after the message', () => {
    expect(addToBatch(EMPTY, 'm1', at(0), WAIT)).toEqual({
      messageIds: ['m1'],
      firstPendingAt: at(0),
      dueAt: at(8),
    });
  });

  it('each new message restarts the wait', () => {
    const first = addToBatch(EMPTY, 'm1', at(0), WAIT);
    expect(addToBatch(first, 'm2', at(5), WAIT)).toEqual({
      messageIds: ['m1', 'm2'],
      firstPendingAt: at(0),
      dueAt: at(13),
    });
  });

  it('never waits more than 30 s after the first pending message', () => {
    let batch = addToBatch(EMPTY, 'm0', at(0), WAIT);
    for (const second of [7, 14, 21, 28]) {
      batch = addToBatch(batch, `m${second}`, at(second), WAIT);
    }
    expect(batch.dueAt).toEqual(at(30));
  });

  it('ignores a message it already has (Meta resends webhooks)', () => {
    const first = addToBatch(EMPTY, 'm1', at(0), WAIT);
    expect(addToBatch(first, 'm1', at(5), WAIT)).toBe(first);
  });
});
