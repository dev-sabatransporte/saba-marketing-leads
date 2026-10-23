import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { BusModule } from '../../bus.module';
import { DrizzleModule } from '../../infrastructure/database/drizzle.module';
import { ErrorsModule } from '../../infrastructure/errors/ErrorsModule';
import { LoggingModule } from '../../infrastructure/logging/LoggingModule';
import type { ReplyToDueChatsPort } from '../../modules/assistant/application/ports/in/ReplyToDueChatsPort';
import type {
  AssistantModelPort,
  ModelReply,
} from '../../modules/assistant/application/ports/out/AssistantModelPort';
import type { StoresSnapshot } from '../../modules/assistant/application/ports/out/StoresSourcePort';
import {
  CatalogUnavailableError,
  ModelUnavailableError,
} from '../../modules/assistant/domain/AssistantErrors';
import {
  CLOSING_REPLY,
  GREETING_REPLY,
  PRICING_REPLY,
} from '../../modules/assistant/domain/fixedReplies';
import {
  HANDOFF_NOTICE,
  type HandoffReason,
  handoffNotice,
} from '../../modules/assistant/domain/handoff';
import type { Store } from '../../modules/assistant/domain/instructions';
import type { Product } from '../../modules/assistant/domain/product';
import { AssistantReplySweeper } from '../../modules/assistant/infrastructure/bus/AssistantReplySweeper';
import {
  assistantPendingReplies,
  assistantRuns,
  assistantSettings,
} from '../../modules/assistant/infrastructure/persistence/assistant.schema';
import { AssistantModule } from '../../modules/assistant/module';
import { ASSISTANT_TOKENS } from '../../modules/assistant/tokens';
import type { ConversationActionsPort } from '../../modules/whatsapp/application/ports/in/ConversationActionsPort';
import type { ProcessWebhookEventPort } from '../../modules/whatsapp/application/ports/in/ProcessWebhookEventPort';
import type { ReplyToConversationPort } from '../../modules/whatsapp/application/ports/in/ReplyToConversationPort';
import type { WebhookEventRepositoryPort } from '../../modules/whatsapp/application/ports/out/WebhookEventRepositoryPort';
import {
  whatsappConversations,
  whatsappMessages,
} from '../../modules/whatsapp/infrastructure/persistence/whatsapp.schema';
import { WhatsAppModule } from '../../modules/whatsapp/module';
import { WHATSAPP_TOKENS } from '../../modules/whatsapp/tokens';
import {
  closeTestDb,
  getTestDb,
  resetDatabase,
  testDatabaseUrl,
} from '../support/testDatabase';

process.env.DATABASE = testDatabaseUrl();

const CUSTOMER_SENT_AT = 1_791_403_246;
let now = new Date((CUSTOMER_SENT_AT + 60) * 1000);

const CATIA: Store = {
  name: 'Catia',
  address: 'Av. Sucre',
  mapUrl: 'https://maps.app.goo.gl/x',
  publicHours: 'Lunes a viernes 8:00 a. m. a 5:00 p. m.',
};

const ANSWER_TEXT =
  'Hola, soy el asistente virtual de Saba. Catia queda en la Av. Sucre.';
// Catia is named, so code appends its map link: the model never writes it.
const SENT_TEXT = `${ANSWER_TEXT}\n\n📍 Catia: https://maps.app.goo.gl/x`;
const REPLY: ModelReply = {
  kind: 'answer',
  text: ANSWER_TEXT,
  model: 'claude-sonnet-5-5',
  usage: {
    inputTokens: 40,
    outputTokens: 20,
    cacheReadTokens: 900,
    cacheWriteTokens: 0,
  },
};

const sendText = vi.fn<(to: string, body: string) => Promise<string>>();
const sendTypingIndicator = vi.fn<(wamid: string) => Promise<void>>();
const reply = vi.fn<AssistantModelPort['reply']>();
const currentStores = vi.fn<() => Promise<StoresSnapshot>>();
const searchProducts = vi.fn<(query: string) => Promise<Product[]>>();

const BERA: Product = {
  name: 'Moto Bera SBR 150',
  model: 'SBR 150',
  brand: 'Bera',
  categories: ['Motos'],
  inStock: true,
};

/** The model asks for a search first, then decides with `then`. */
function searchThen(query: string, then: ModelReply): void {
  reply
    .mockResolvedValueOnce({
      ...REPLY,
      kind: 'search_products',
      callId: 'toolu_1',
      query,
    })
    .mockResolvedValueOnce(then);
}

function customerMessage(
  wamid: string,
  message: Record<string, unknown>
): unknown {
  return {
    messaging_product: 'whatsapp',
    contacts: [{ wa_id: '584140000001', profile: { name: 'Cliente' } }],
    messages: [
      {
        id: wamid,
        from: '584140000001',
        timestamp: String(CUSTOMER_SENT_AT),
        ...message,
      },
    ],
  };
}

const textMessage = (body: string, wamid = 'wamid.IN1', secondsLater = 0) =>
  customerMessage(wamid, {
    type: 'text',
    text: { body },
    timestamp: String(CUSTOMER_SENT_AT + secondsLater),
  });

describe('assistant turn (webhook → wait → model → WhatsApp)', () => {
  let app: INestApplication;
  let processEvent: ProcessWebhookEventPort;
  let events: WebhookEventRepositoryPort;
  let replyToDue: ReplyToDueChatsPort;

  /** Messages in the queue, waiting or being answered. */
  async function queued(): Promise<number> {
    const rows = await getTestDb().select().from(assistantPendingReplies);
    return rows.reduce(
      (total, row) => total + row.messageIds.length + row.claimedIds.length,
      0
    );
  }

  /** The webhook arrives and the message joins the chat's batch (if it should). */
  async function deliver(payload: unknown): Promise<void> {
    const before = await queued();
    const [eventId] = await events.save([{ field: 'messages', payload }]);
    if (!eventId) throw new Error('no se guardó el evento');
    await processEvent.execute(eventId);
    // Queued off the event bus, with the clock as it is now; nothing is
    // queued when the message is not for the assistant.
    await vi
      .waitFor(
        async () => {
          if ((await queued()) === before) {
            throw new Error('todavía no está en la cola');
          }
        },
        { timeout: 300 }
      )
      .catch(() => undefined);
  }

  /** The sweep, `seconds` after now (the timer is off in this test). */
  async function sweepAfter(seconds: number): Promise<number> {
    now = new Date(now.getTime() + seconds * 1000);
    return replyToDue.execute();
  }

  /** A message, and the assistant's turn once the longest wait is over. */
  async function receive(payload: unknown): Promise<void> {
    await deliver(payload);
    await sweepAfter(31);
  }

  async function turnOn(): Promise<void> {
    await getTestDb().insert(assistantSettings).values({ enabled: true });
  }

  /** The handler runs off the event bus: wait until the turn left its row. */
  async function waitForRun() {
    return vi.waitFor(async () => {
      const [run] = await getTestDb().select().from(assistantRuns);
      if (!run) throw new Error('todavía no hay turno');
      return run;
    });
  }

  /** A fresh API process against the same database. */
  async function startApp(): Promise<void> {
    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggingModule,
        ErrorsModule,
        DrizzleModule,
        BusModule,
        WhatsAppModule,
        AssistantModule,
      ],
    })
      .overrideProvider(WHATSAPP_TOKENS.WhatsAppCloud)
      .useValue({
        sendText,
        downloadMedia: vi.fn(),
        sendTypingIndicator,
      })
      .overrideProvider(WHATSAPP_TOKENS.Clock)
      .useValue({ now: () => now })
      .overrideProvider(ASSISTANT_TOKENS.Clock)
      .useValue({ now: () => now })
      .overrideProvider(ASSISTANT_TOKENS.Model)
      .useValue({ reply })
      .overrideProvider(ASSISTANT_TOKENS.Products)
      .useValue({ search: searchProducts })
      .overrideProvider(ASSISTANT_TOKENS.Stores)
      .useValue({ current: currentStores })
      // The test moves the clock and sweeps by hand.
      .overrideProvider(AssistantReplySweeper)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    processEvent = app.get(WHATSAPP_TOKENS.ProcessWebhookEvent);
    events = app.get(WHATSAPP_TOKENS.WebhookEventRepository);
    replyToDue = app.get(ASSISTANT_TOKENS.ReplyToDueChats);
  }

  beforeAll(startApp);

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetDatabase();
    now = new Date((CUSTOMER_SENT_AT + 60) * 1000);
    let sent = 0;
    sendText.mockReset().mockImplementation(async () => `wamid.OUT${++sent}`);
    sendTypingIndicator.mockReset().mockResolvedValue(undefined);
    reply.mockReset().mockResolvedValue(REPLY);
    searchProducts.mockReset().mockResolvedValue([BERA]);
    currentStores
      .mockReset()
      .mockResolvedValue({ stores: [CATIA], misconfigured: false });
  });

  it('answers with the stores in the instructions, adds the map link of the store it names and records the turn', async () => {
    await turnOn();

    await receive(textMessage('¿Dónde queda la tienda de Catia?'));
    const run = await waitForRun();

    const [input] = reply.mock.calls[0] ?? [];
    expect(input?.instructions).toContain('asistente virtual de Saba');
    expect(input?.instructions).toContain('Catia');
    expect(input?.instructions).toContain('Av. Sucre');
    expect(input?.instructions).not.toContain('https://maps.app.goo.gl/x');
    expect(input?.turns).toEqual([
      { role: 'user', content: '¿Dónde queda la tienda de Catia?' },
    ]);

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith('584140000001', SENT_TEXT);

    const sent = await getTestDb()
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.source, 'assistant'));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ body: SENT_TEXT, sentBy: null });

    const [inbound] = await getTestDb()
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.source, 'customer'));
    expect(run).toMatchObject({
      conversationId: inbound?.conversationId,
      inboundMessageIds: [inbound?.id],
      sentMessageId: sent[0]?.id,
      outcome: 'answered',
      model: 'claude-sonnet-5-5',
      inputTokens: 40,
      outputTokens: 20,
      cacheReadTokens: 900,
      cacheWriteTokens: 0,
    });
    expect(run.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('answers several messages that arrive together with a single reply', async () => {
    await turnOn();

    await receive({
      messaging_product: 'whatsapp',
      contacts: [{ wa_id: '584140000001', profile: { name: 'Cliente' } }],
      messages: [
        {
          id: 'wamid.A',
          from: '584140000001',
          timestamp: String(CUSTOMER_SENT_AT),
          type: 'text',
          text: { body: 'hola' },
        },
        {
          id: 'wamid.B',
          from: '584140000001',
          timestamp: String(CUSTOMER_SENT_AT + 1),
          type: 'text',
          text: { body: '¿dónde queda Catia?' },
        },
      ],
    });
    await waitForRun();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0].turns).toEqual([
      { role: 'user', content: 'hola\n¿dónde queda Catia?' },
    ]);
    expect(await getTestDb().select().from(assistantRuns)).toHaveLength(1);
  });

  it('switched off, everything works as today: nothing is sent or recorded', async () => {
    await receive(textMessage('hola'));

    // The inbound message is saved as always.
    const saved = await getTestDb().select().from(whatsappMessages);
    expect(saved).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reply).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect(await getTestDb().select().from(assistantRuns)).toEqual([]);
  });

  it('reads the switch on every turn', async () => {
    await receive(textMessage('hola', 'wamid.A'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reply).not.toHaveBeenCalled();

    await turnOn();
    await receive(textMessage('¿y ahora?', 'wamid.B'));
    await waitForRun();
    expect(reply).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    'answers a turn with simple replies %s read from the settings',
    async (simpleReplies) => {
      await getTestDb()
        .insert(assistantSettings)
        .values({ enabled: true, simpleReplies });

      await receive(textMessage('¿Dónde queda la tienda de Catia?'));
      const run = await waitForRun();

      const [input] = reply.mock.calls[0] ?? [];
      expect(input?.simpleReplies).toBe(simpleReplies);
      expect(input?.instructions.includes('en 1 o 2 frases')).toBe(
        simpleReplies
      );
      expect(sendText).toHaveBeenCalledWith('584140000001', SENT_TEXT);
      expect(run).toMatchObject({ outcome: 'answered' });
    }
  );

  it('starts with simple replies on', async () => {
    await turnOn();

    await receive(textMessage('hola'));
    await waitForRun();

    expect(reply.mock.calls[0]?.[0].simpleReplies).toBe(true);
  });

  it('answers without store data when Saba never answered, with the instructions saying so', async () => {
    await turnOn();
    currentStores.mockResolvedValue({ stores: null, misconfigured: false });

    await receive(textMessage('¿Dónde queda Catia?'));
    await waitForRun();

    const [input] = reply.mock.calls[0] ?? [];
    expect(input?.instructions).toContain('No tienes datos de sedes');
  });

  async function conversation() {
    const [row] = await getTestDb().select().from(whatsappConversations);
    if (!row) throw new Error('sin conversación');
    return row;
  }

  /** The notice went out, the chat is marked for a person and the run says why. */
  async function expectHandoff(reason: HandoffReason) {
    const run = await waitForRun();
    expect(sendText).toHaveBeenCalledWith(
      '584140000001',
      handoffNotice(reason)
    );
    expect(await conversation()).toMatchObject({
      handoffReason: reason,
      assignedTo: null,
    });
    expect((await conversation()).handoffRequestedAt).not.toBeNull();
    expect(run).toMatchObject({ outcome: 'handoff', reason });
    return run;
  }

  it.each([
    'out_of_scope',
    'customer_requested',
    'data_not_found',
    'out_of_stock',
  ] as const)('hands over when the model chooses %s', async (reason) => {
    await turnOn();
    reply.mockResolvedValue({ ...REPLY, kind: 'handoff', reason });

    await receive(textMessage('¿cuánto cuesta la moto?'));

    await expectHandoff(reason);
  });

  it.each([
    ['greeting', '¡hola!', GREETING_REPLY],
    ['closing', 'gracias', CLOSING_REPLY],
  ] as const)(
    'later in the chat, answers a batch that is only a %s with the fixed text',
    async (fixed, body, text) => {
      await turnOn();
      await receive(textMessage('¿dónde queda Catia?', 'wamid.A'));
      await waitForRun();
      reply.mockResolvedValueOnce({ ...REPLY, kind: 'fixed', reply: fixed });

      await receive(textMessage(body, 'wamid.B', 100));

      await vi.waitFor(async () =>
        expect(await getTestDb().select().from(assistantRuns)).toHaveLength(2)
      );
      expect(sendText).toHaveBeenLastCalledWith('584140000001', text);
      const runs = await getTestDb().select().from(assistantRuns);
      expect(runs).toContainEqual(
        expect.objectContaining({ outcome: 'answered', reason: fixed })
      );
      expect((await conversation()).handoffRequestedAt).toBeNull();
    }
  );

  it('stays silent after handing over, even if the customer keeps writing', async () => {
    await turnOn();
    reply.mockResolvedValue({
      ...REPLY,
      kind: 'handoff',
      reason: 'customer_requested',
    });
    await receive(textMessage('quiero hablar con alguien', 'wamid.A'));
    await waitForRun();
    reply.mockClear();
    sendText.mockClear();

    await receive(textMessage('¿hola?', 'wamid.B'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(reply).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect(await getTestDb().select().from(assistantRuns)).toHaveLength(1);
  });

  it('hands over with error when the model fails, without technical details', async () => {
    await turnOn();
    reply.mockRejectedValue(
      new ModelUnavailableError('api_error', 'Anthropic 529: overloaded')
    );

    await receive(textMessage('hola'));

    const run = await expectHandoff('error');
    expect(run.errorDetail).toBe('api_error: Anthropic 529: overloaded');
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it('hands over with error on a refusal', async () => {
    await turnOn();
    reply.mockRejectedValue(
      new ModelUnavailableError('refusal', 'el modelo se negó a responder')
    );

    await receive(textMessage('hola'));

    await expectHandoff('error');
  });

  it('hands over with error instead of sending a reply cut at the output cap', async () => {
    await turnOn();
    reply.mockRejectedValue(
      new ModelUnavailableError(
        'truncated',
        'el modelo llegó al tope de salida',
        { model: REPLY.model, usage: REPLY.usage }
      )
    );

    await receive(textMessage('¿Qué sedes tienen?'));

    const run = await expectHandoff('error');
    expect(run.errorDetail).toBe(
      'truncated: el modelo llegó al tope de salida'
    );
    expect(run.outputTokens).toBe(20);
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it('hands over with error when Saba rejects the assistant key', async () => {
    await turnOn();
    currentStores.mockResolvedValue({ stores: null, misconfigured: true });

    await receive(textMessage('¿Dónde queda Catia?'));

    await expectHandoff('error');
    expect(reply).not.toHaveBeenCalled();
  });

  it('hands over a message that is not text', async () => {
    await turnOn();

    await receive(
      customerMessage('wamid.IMG', {
        type: 'image',
        image: { id: 'media-1', mime_type: 'image/jpeg' },
      })
    );

    await expectHandoff('non_text');
    expect(reply).not.toHaveBeenCalled();
  });

  /** First exchange answered by the assistant; returns the conversation id. */
  async function chatStarted(): Promise<string> {
    await turnOn();
    await receive(textMessage('hola', 'wamid.A'));
    await waitForRun();
    reply.mockClear();
    sendText.mockClear();
    return (await conversation()).id;
  }

  async function customerWritesAgainAndNobodyAnswers(): Promise<void> {
    await receive(textMessage('¿siguen ahí?', 'wamid.B', 120));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reply).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  }

  it('stays silent once the chat is assigned to someone', async () => {
    const id = await chatStarted();
    await getTestDb()
      .update(whatsappConversations)
      .set({ assignedTo: '11111111-1111-1111-1111-111111111111' })
      .where(eq(whatsappConversations.id, id));

    await customerWritesAgainAndNobodyAnswers();
  });

  it('stays silent once a person answers from the panel', async () => {
    const id = await chatStarted();
    await app
      .get<ReplyToConversationPort>(WHATSAPP_TOKENS.ReplyToConversation)
      .execute({
        conversationId: id,
        body: 'Hola, te atiende Ana',
        sentBy: '11111111-1111-1111-1111-111111111111',
      });
    sendText.mockClear();

    await customerWritesAgainAndNobodyAnswers();
  });

  it('stays silent once a person answers from the phone', async () => {
    const id = await chatStarted();
    await getTestDb().insert(whatsappMessages).values({
      conversationId: id,
      wamid: 'wamid.PHONE',
      direction: 'outbound',
      source: 'phone',
      type: 'text',
      body: 'te escribo desde el celular',
      waTimestamp: now,
    });

    await customerWritesAgainAndNobodyAnswers();
  });

  it('stays silent once someone turns it off in the chat', async () => {
    const id = await chatStarted();
    await app
      .get<ConversationActionsPort>(WHATSAPP_TOKENS.ConversationActions)
      .setAssistantEnabled(id, false, '11111111-1111-1111-1111-111111111111');

    await customerWritesAgainAndNobodyAnswers();
  });

  it('answers again once someone turns it back on, ignoring earlier replies by a person', async () => {
    const id = await chatStarted();
    await app
      .get<ReplyToConversationPort>(WHATSAPP_TOKENS.ReplyToConversation)
      .execute({
        conversationId: id,
        body: 'Listo, ya te atendí',
        sentBy: '11111111-1111-1111-1111-111111111111',
      });
    expect(await conversation()).toMatchObject({
      assistantPausedBy: '11111111-1111-1111-1111-111111111111',
    });
    now = new Date((CUSTOMER_SENT_AT + 600) * 1000);
    await app
      .get<ConversationActionsPort>(WHATSAPP_TOKENS.ConversationActions)
      .setAssistantEnabled(id, true, '11111111-1111-1111-1111-111111111111');
    sendText.mockClear();

    await receive(textMessage('otra pregunta', 'wamid.C', 900));

    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(sendText).toHaveBeenCalledWith('584140000001', SENT_TEXT)
    );
  });

  it('turning it back on clears the "Necesita asesor" mark', async () => {
    await turnOn();
    reply.mockResolvedValueOnce({
      ...REPLY,
      kind: 'handoff',
      reason: 'customer_requested',
    });
    await receive(textMessage('quiero hablar con alguien', 'wamid.A'));
    await waitForRun();

    await app
      .get<ConversationActionsPort>(WHATSAPP_TOKENS.ConversationActions)
      .setAssistantEnabled(
        (await conversation()).id,
        true,
        '11111111-1111-1111-1111-111111111111'
      );

    expect(await conversation()).toMatchObject({
      handoffRequestedAt: null,
      handoffReason: null,
      assistantPausedAt: null,
    });
  });

  it('does not answer outside the 24 h window', async () => {
    await turnOn();
    now = new Date((CUSTOMER_SENT_AT + 25 * 60 * 60) * 1000);

    await receive(textMessage('hola'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(reply).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  describe('product questions', () => {
    it('answers with what Saba returned when it is in stock', async () => {
      await turnOn();
      const text = 'Sí, tenemos la Moto Bera SBR 150 y hay stock.';
      searchThen('bera sbr', { ...REPLY, text });

      await receive(textMessage('¿tienen la bera sbr?'));
      const run = await waitForRun();

      expect(searchProducts).toHaveBeenCalledWith('bera sbr');
      expect(reply.mock.calls[1]?.[0].searches).toEqual([
        { callId: 'toolu_1', query: 'bera sbr', products: [BERA] },
      ]);
      expect(sendText).toHaveBeenCalledWith('584140000001', text);
      expect(run).toMatchObject({
        outcome: 'answered',
        toolCalls: [
          { tool: 'search_products', query: 'bera sbr', resultCount: 1 },
        ],
        inputTokens: 80,
      });
    });

    it('says the model is carried and hands over when it is out of stock', async () => {
      await turnOn();
      searchProducts.mockResolvedValue([{ ...BERA, inStock: false }]);
      searchThen('bera sbr', {
        ...REPLY,
        kind: 'handoff',
        reason: 'out_of_stock',
      });

      await receive(textMessage('¿tienen la bera sbr?'));
      const run = await expectHandoff('out_of_stock');

      expect(sendText).toHaveBeenCalledWith(
        '584140000001',
        expect.stringContaining('lo manejamos')
      );
      expect(run.toolCalls).toEqual([
        { tool: 'search_products', query: 'bera sbr', resultCount: 1 },
      ]);
    });

    it('hands over with data_not_found when the product is not in Saba', async () => {
      await turnOn();
      searchProducts.mockResolvedValue([]);
      searchThen('yamaha r1', {
        ...REPLY,
        kind: 'handoff',
        reason: 'data_not_found',
      });

      await receive(textMessage('¿tienen la yamaha r1?'));
      const run = await expectHandoff('data_not_found');

      expect(run.toolCalls).toEqual([
        { tool: 'search_products', query: 'yamaha r1', resultCount: 0 },
      ]);
    });

    /** The prices text went out as an answer: no "Necesita asesor". */
    async function expectPricesText() {
      const run = await waitForRun();
      expect(sendText).toHaveBeenCalledTimes(1);
      expect(sendText).toHaveBeenCalledWith(
        '584140000001',
        expect.stringContaining(PRICING_REPLY)
      );
      expect(await conversation()).toMatchObject({
        handoffRequestedAt: null,
        handoffReason: null,
      });
      expect(run).toMatchObject({ outcome: 'answered', reason: 'pricing' });
      return run;
    }

    it('answers a price question with the prices text and never sends an amount', async () => {
      await turnOn();
      searchThen('bera sbr', {
        ...REPLY,
        text: 'La Bera SBR 150 tiene una inicial de US$ 300.',
      });

      await receive(textMessage('¿cuánto es la inicial de la bera sbr?'));
      const run = await expectPricesText();

      expect(sendText).not.toHaveBeenCalledWith(
        '584140000001',
        expect.stringContaining('300')
      );
      expect(run.errorDetail).toContain('monto');
    });

    it('sends the prices text when the model picks pricing after finding the product, and keeps answering', async () => {
      await turnOn();
      // What the adapter returns for `transfer_to_human` with `pricing`.
      searchThen('bera sbr', { ...REPLY, kind: 'fixed', reply: 'pricing' });

      await receive(
        textMessage('¿en cuántas cuotas me dan la bera sbr?', 'wamid.A')
      );
      const run = await expectPricesText();
      expect(run.toolCalls).toEqual([
        { tool: 'search_products', query: 'bera sbr', resultCount: 1 },
      ]);

      await receive(textMessage('¿y dónde queda Catia?', 'wamid.B', 100));

      await vi.waitFor(() => expect(sendText).toHaveBeenCalledTimes(2));
      expect(sendText).toHaveBeenLastCalledWith('584140000001', SENT_TEXT);
    });

    it('never sends an amount even without a currency sign', async () => {
      await turnOn();
      searchThen('bera sbr', {
        ...REPLY,
        text: 'La Bera SBR 150 sale en 12 cuotas de 80.',
      });

      await receive(textMessage('¿cuánto pago al mes por la bera sbr?'));
      await expectPricesText();

      expect(sendText).not.toHaveBeenCalledWith(
        '584140000001',
        expect.stringContaining('cuotas de 80')
      );
    });

    it('hands over with error when Saba is down, without telling the customer why', async () => {
      await turnOn();
      searchProducts.mockRejectedValue(
        new CatalogUnavailableError(false, 'Saba respondió 429')
      );
      reply.mockResolvedValueOnce({
        ...REPLY,
        kind: 'search_products',
        callId: 'toolu_1',
        query: 'bera sbr',
      });

      await receive(textMessage('¿tienen la bera sbr?'));
      const run = await expectHandoff('error');

      expect(reply).toHaveBeenCalledTimes(1);
      expect(sendText).toHaveBeenCalledWith('584140000001', HANDOFF_NOTICE);
      expect(run).toMatchObject({
        errorDetail: expect.stringContaining('429'),
        toolCalls: [
          { tool: 'search_products', query: 'bera sbr', resultCount: null },
        ],
      });
    });
  });

  describe('reply limits', () => {
    async function runs() {
      return getTestDb().select().from(assistantRuns);
    }

    /** Waits until the turn of this message left its row. */
    async function receiveAndWait(payload: unknown): Promise<void> {
      const before = (await runs()).length;
      await receive(payload);
      await vi.waitFor(async () => {
        if ((await runs()).length === before) {
          throw new Error('todavía no hay turno');
        }
      });
    }

    /** The customer writes `seconds` after the first message; the clock follows. */
    function writesAt(body: string, wamid: string, seconds: number): unknown {
      now = new Date((CUSTOMER_SENT_AT + seconds + 1) * 1000);
      return textMessage(body, wamid, seconds);
    }

    /** Answered turns of other chats, as if the assistant had been busy today. */
    async function repliesElsewhere(count: number, at: Date): Promise<void> {
      await getTestDb()
        .insert(assistantRuns)
        .values(
          Array.from({ length: count }, () => ({
            conversationId: crypto.randomUUID(),
            inboundMessageIds: [crypto.randomUUID()],
            outcome: 'answered' as const,
            latencyMs: 10,
            createdAt: at,
          }))
        );
    }

    it('hands a contact over once with limit_reached after its replies of the last 24 h', async () => {
      await getTestDb()
        .insert(assistantSettings)
        .values({ enabled: true, perContactDailyLimit: 2 });

      await receiveAndWait(writesAt('hola', 'wamid.A', 0));
      await receiveAndWait(writesAt('¿y Catia?', 'wamid.B', 100));
      expect(sendText).toHaveBeenCalledTimes(2);
      reply.mockClear();

      await receiveAndWait(writesAt('¿y el horario?', 'wamid.C', 200));
      const run = (await runs()).at(-1);
      expect(reply).not.toHaveBeenCalled();
      expect(sendText).toHaveBeenLastCalledWith('584140000001', HANDOFF_NOTICE);
      expect(await conversation()).toMatchObject({
        handoffReason: 'limit_reached',
        assignedTo: null,
      });
      expect(run).toMatchObject({
        outcome: 'handoff',
        reason: 'limit_reached',
      });

      // Silent from then on: a single handoff, not one per message.
      sendText.mockClear();
      await receive(writesAt('¿hola?', 'wamid.D', 300));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(sendText).not.toHaveBeenCalled();
      expect(reply).not.toHaveBeenCalled();
      expect(await runs()).toHaveLength(3);
    });

    it('counts the fixed greeting, closing and prices texts as replies', async () => {
      await getTestDb()
        .insert(assistantSettings)
        .values({ enabled: true, perContactDailyLimit: 3 });

      for (const [fixed, wamid, seconds] of [
        ['greeting', 'wamid.A', 0],
        ['pricing', 'wamid.B', 100],
        ['closing', 'wamid.C', 200],
      ] as const) {
        reply.mockResolvedValueOnce({ ...REPLY, kind: 'fixed', reply: fixed });
        await receiveAndWait(writesAt('hola', wamid, seconds));
      }
      reply.mockClear();

      await receiveAndWait(writesAt('¿y Catia?', 'wamid.D', 300));
      expect(reply).not.toHaveBeenCalled();
      expect((await runs()).at(-1)).toMatchObject({
        outcome: 'handoff',
        reason: 'limit_reached',
      });
    });

    it('answers the contact again once its replies are older than 24 h', async () => {
      await getTestDb()
        .insert(assistantSettings)
        .values({ enabled: true, perContactDailyLimit: 2 });
      await receiveAndWait(writesAt('hola', 'wamid.A', 0));
      await receiveAndWait(writesAt('¿y Catia?', 'wamid.B', 100));

      // At the limit within 24 h this would hand over; a day later it answers.
      await receiveAndWait(
        writesAt('¿siguen ahí?', 'wamid.C', 24 * 60 * 60 + 200)
      );

      expect(sendText).toHaveBeenCalledTimes(3);
      expect(sendText).toHaveBeenLastCalledWith('584140000001', SENT_TEXT);
      expect((await runs()).at(-1)).toMatchObject({ outcome: 'answered' });
      expect(await conversation()).toMatchObject({ handoffReason: null });
    });

    it('counts several messages answered together as a single reply', async () => {
      await getTestDb()
        .insert(assistantSettings)
        .values({ enabled: true, perContactDailyLimit: 2 });

      now = new Date((CUSTOMER_SENT_AT + 3) * 1000);
      await receiveAndWait({
        messaging_product: 'whatsapp',
        contacts: [{ wa_id: '584140000001', profile: { name: 'Cliente' } }],
        messages: ['hola', 'buenas', '¿dónde queda Catia?'].map((body, i) => ({
          id: `wamid.G${i}`,
          from: '584140000001',
          timestamp: String(CUSTOMER_SENT_AT + i),
          type: 'text',
          text: { body },
        })),
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      await receiveAndWait(writesAt('¿y el horario?', 'wamid.H', 100));

      expect(sendText).toHaveBeenCalledTimes(2);
      expect(sendText).toHaveBeenLastCalledWith('584140000001', SENT_TEXT);
      expect((await runs()).map((r) => r.outcome)).toEqual([
        'answered',
        'answered',
      ]);
    });

    it("stays silent for the rest of the day once the day's limit is reached, without a handoff", async () => {
      await getTestDb()
        .insert(assistantSettings)
        .values({ enabled: true, dailyReplyLimit: 3 });
      await repliesElsewhere(3, now);

      await receive(textMessage('hola'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(reply).not.toHaveBeenCalled();
      expect(sendText).not.toHaveBeenCalled();
      expect(await conversation()).toMatchObject({
        handoffRequestedAt: null,
        handoffReason: null,
      });
      expect(await runs()).toHaveLength(3);
    });

    it('answers again after midnight in Venezuela', async () => {
      await getTestDb()
        .insert(assistantSettings)
        .values({ enabled: true, dailyReplyLimit: 3 });
      // 23:59 in Caracas: the day's three replies went out a minute ago.
      const midnight = Date.parse('2026-10-08T04:00:00Z') / 1000;
      await repliesElsewhere(3, new Date((midnight - 60) * 1000));
      const sentAt = (seconds: number) => seconds - CUSTOMER_SENT_AT;

      // Its wait ends before midnight too.
      now = new Date((midnight - 90) * 1000);
      await receive(textMessage('hola', 'wamid.A', sentAt(midnight - 100)));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(sendText).not.toHaveBeenCalled();

      now = new Date((midnight + 30) * 1000);
      await receiveAndWait(
        textMessage('¿siguen ahí?', 'wamid.B', sentAt(midnight + 20))
      );
      expect(sendText).toHaveBeenCalledWith('584140000001', SENT_TEXT);
      expect((await runs()).at(-1)).toMatchObject({ outcome: 'answered' });
    });
  });

  describe('waiting for the customer to finish', () => {
    /** The customer writes `seconds` after the first message; the clock follows. */
    function sentAt(body: string, wamid: string, seconds: number): unknown {
      now = new Date((CUSTOMER_SENT_AT + seconds) * 1000);
      return textMessage(body, wamid, seconds);
    }

    async function pendingRows() {
      return getTestDb().select().from(assistantPendingReplies);
    }

    it('each message restarts the 8 s wait; then one reply covers all of them', async () => {
      await turnOn();

      await deliver(sentAt('hola', 'wamid.A', 0));
      await deliver(sentAt('una pregunta', 'wamid.B', 5));
      await deliver(sentAt('¿dónde queda Catia?', 'wamid.C', 9));

      // 16 s after the first, but only 7 s after the last: still waiting.
      expect(await sweepAfter(7)).toBe(0);
      expect(reply).not.toHaveBeenCalled();

      expect(await sweepAfter(1)).toBe(1);
      expect(reply).toHaveBeenCalledTimes(1);
      expect(reply.mock.calls[0]?.[0].turns).toEqual([
        {
          role: 'user',
          content: 'hola\nuna pregunta\n¿dónde queda Catia?',
        },
      ]);
      expect(sendText).toHaveBeenCalledTimes(1);
      const runs = await getTestDb().select().from(assistantRuns);
      expect(runs).toHaveLength(1);
      expect(runs[0]?.inboundMessageIds).toHaveLength(3);
      expect(await pendingRows()).toEqual([]);
    });

    it('never waits more than 30 s for someone who keeps writing', async () => {
      await turnOn();
      for (const second of [0, 7, 14, 21, 28]) {
        await deliver(sentAt(`mensaje ${second}`, `wamid.${second}`, second));
      }

      // 29 s after the first: the last one is only 1 s old, but the cap is near.
      expect(await sweepAfter(1)).toBe(0);
      expect(await sweepAfter(1)).toBe(1);
      expect(sendText).toHaveBeenCalledTimes(1);
      const [run] = await getTestDb().select().from(assistantRuns);
      expect(run?.inboundMessageIds).toHaveLength(5);
    });

    it('the wait survives a restart of the API', async () => {
      await turnOn();
      await deliver(sentAt('hola', 'wamid.A', 0));

      await app.close();
      await startApp();

      expect(await sweepAfter(8)).toBe(1);
      expect(sendText).toHaveBeenCalledWith('584140000001', SENT_TEXT);
    });

    it('a message that arrives after the reply starts a new wait', async () => {
      await turnOn();
      await receive(sentAt('hola', 'wamid.A', 0));
      expect(sendText).toHaveBeenCalledTimes(1);

      await deliver(sentAt('¿y el horario?', 'wamid.B', 60));
      expect(await sweepAfter(7)).toBe(0);
      expect(await sweepAfter(1)).toBe(1);

      expect(sendText).toHaveBeenCalledTimes(2);
      expect(reply.mock.calls[1]?.[0].turns.at(-1)).toEqual({
        role: 'user',
        content: '¿y el horario?',
      });
    });

    it('answers a message that arrived while the previous reply was being written', async () => {
      await turnOn();
      await deliver(sentAt('hola', 'wamid.A', 0));
      reply.mockImplementationOnce(async () => {
        // The customer writes while the model thinks: it lands before the reply.
        await deliver(sentAt('¿dónde queda Catia?', 'wamid.B', 9));
        now = new Date((CUSTOMER_SENT_AT + 10) * 1000);
        return REPLY;
      });

      expect(await sweepAfter(8)).toBe(1);
      expect(await sweepAfter(8)).toBe(1);

      expect(reply).toHaveBeenCalledTimes(2);
      expect(reply.mock.calls[1]?.[0].turns.at(-1)).toEqual({
        role: 'user',
        content: '¿dónde queda Catia?',
      });
      expect(sendText).toHaveBeenCalledTimes(2);
    });

    it('does not answer if a person takes the chat during the wait', async () => {
      await turnOn();
      await deliver(sentAt('hola', 'wamid.A', 0));
      await getTestDb()
        .update(whatsappConversations)
        .set({ assignedTo: '11111111-1111-1111-1111-111111111111' });

      expect(await sweepAfter(8)).toBe(1);

      expect(reply).not.toHaveBeenCalled();
      expect(sendText).not.toHaveBeenCalled();
      expect(sendTypingIndicator).not.toHaveBeenCalled();
      // Nothing left waiting: the turn ended, it just had nothing to say.
      expect(await pendingRows()).toEqual([]);
    });

    it('does not answer if the assistant is switched off during the wait', async () => {
      await turnOn();
      await deliver(sentAt('hola', 'wamid.A', 0));
      await getTestDb().update(assistantSettings).set({ enabled: false });

      await sweepAfter(8);

      expect(reply).not.toHaveBeenCalled();
      expect(sendText).not.toHaveBeenCalled();
    });

    it('waits as long as the settings say, read when the message arrives', async () => {
      await getTestDb()
        .insert(assistantSettings)
        .values({ enabled: true, debounceSeconds: 3, maxWaitSeconds: 10 });

      await deliver(sentAt('hola', 'wamid.A', 0));

      expect(await sweepAfter(2)).toBe(0);
      expect(await sweepAfter(1)).toBe(1);
      expect(sendText).toHaveBeenCalledTimes(1);
    });

    it('shows "escribiendo" on the customer\'s last message before the reply', async () => {
      await turnOn();
      await deliver(sentAt('hola', 'wamid.A', 0));
      await deliver(sentAt('¿dónde queda Catia?', 'wamid.B', 2));

      await sweepAfter(8);

      expect(sendTypingIndicator).toHaveBeenCalledWith('wamid.B');
      expect(sendTypingIndicator.mock.invocationCallOrder[0]).toBeLessThan(
        sendText.mock.invocationCallOrder[0] ?? 0
      );
    });

    it('hands over once a batch with an image among the texts', async () => {
      await turnOn();
      await deliver(sentAt('mira esta foto', 'wamid.A', 0));
      await deliver(
        customerMessage('wamid.IMG', {
          type: 'image',
          image: { id: 'media-1', mime_type: 'image/jpeg' },
          timestamp: String(CUSTOMER_SENT_AT + 1),
        })
      );

      await sweepAfter(9);

      expect(reply).not.toHaveBeenCalled();
      expect(sendText).toHaveBeenCalledTimes(1);
      expect(sendText).toHaveBeenCalledWith('584140000001', HANDOFF_NOTICE);
      const [run] = await getTestDb().select().from(assistantRuns);
      expect(run).toMatchObject({ outcome: 'handoff', reason: 'non_text' });
      expect(run?.inboundMessageIds).toHaveLength(2);
    });
  });
});
