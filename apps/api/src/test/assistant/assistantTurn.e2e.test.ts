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
  HANDOFF_NOTICE,
  type HandoffReason,
  handoffNotice,
} from '../../modules/assistant/domain/handoff';
import type { Store } from '../../modules/assistant/domain/instructions';
import type { Product } from '../../modules/assistant/domain/product';
import {
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

describe('assistant turn (webhook → model → WhatsApp)', () => {
  let app: INestApplication;
  let processEvent: ProcessWebhookEventPort;
  let events: WebhookEventRepositoryPort;

  async function receive(payload: unknown): Promise<void> {
    const [eventId] = await events.save([{ field: 'messages', payload }]);
    if (!eventId) throw new Error('no se guardó el evento');
    await processEvent.execute(eventId);
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

  beforeAll(async () => {
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
        sendTypingIndicator: vi.fn(),
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
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    processEvent = app.get(WHATSAPP_TOKENS.ProcessWebhookEvent);
    events = app.get(WHATSAPP_TOKENS.WebhookEventRepository);
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetDatabase();
    now = new Date((CUSTOMER_SENT_AT + 60) * 1000);
    let sent = 0;
    sendText.mockReset().mockImplementation(async () => `wamid.OUT${++sent}`);
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
    'pricing',
    'out_of_stock',
  ] as const)('hands over when the model chooses %s', async (reason) => {
    await turnOn();
    reply.mockResolvedValue({ ...REPLY, kind: 'handoff', reason });

    await receive(textMessage('¿cuánto cuesta la moto?'));

    await expectHandoff(reason);
  });

  it('stays silent after handing over, even if the customer keeps writing', async () => {
    await turnOn();
    reply.mockResolvedValue({ ...REPLY, kind: 'handoff', reason: 'pricing' });
    await receive(textMessage('¿cuánto cuesta?', 'wamid.A'));
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
      reason: 'pricing',
    });
    await receive(textMessage('¿cuánto cuesta?', 'wamid.A'));
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

    it('hands a price question over and never sends an amount', async () => {
      await turnOn();
      searchThen('bera sbr', {
        ...REPLY,
        text: 'La Bera SBR 150 tiene una inicial de US$ 300.',
      });

      await receive(textMessage('¿cuánto es la inicial de la bera sbr?'));
      await expectHandoff('pricing');

      expect(sendText).toHaveBeenCalledTimes(1);
      expect(sendText).not.toHaveBeenCalledWith(
        '584140000001',
        expect.stringContaining('300')
      );
    });

    it('hands over for pricing when the model chooses it after finding the product', async () => {
      await turnOn();
      searchThen('bera sbr', { ...REPLY, kind: 'handoff', reason: 'pricing' });

      await receive(textMessage('¿en cuántas cuotas me dan la bera sbr?'));
      const run = await expectHandoff('pricing');

      expect(sendText).toHaveBeenCalledTimes(1);
      expect(run.toolCalls).toEqual([
        { tool: 'search_products', query: 'bera sbr', resultCount: 1 },
      ]);
    });

    it('never sends an amount even without a currency sign', async () => {
      await turnOn();
      searchThen('bera sbr', {
        ...REPLY,
        text: 'La Bera SBR 150 sale en 12 cuotas de 80.',
      });

      await receive(textMessage('¿cuánto pago al mes por la bera sbr?'));
      await expectHandoff('pricing');

      expect(sendText).toHaveBeenCalledTimes(1);
      expect(sendText).not.toHaveBeenCalledWith(
        '584140000001',
        expect.stringContaining('cuotas')
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
});
