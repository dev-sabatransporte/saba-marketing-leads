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
import { ModelUnavailableError } from '../../modules/assistant/domain/AssistantErrors';
import type { Store } from '../../modules/assistant/domain/instructions';
import {
  assistantRuns,
  assistantSettings,
} from '../../modules/assistant/infrastructure/persistence/assistant.schema';
import { AssistantModule } from '../../modules/assistant/module';
import { ASSISTANT_TOKENS } from '../../modules/assistant/tokens';
import type { ProcessWebhookEventPort } from '../../modules/whatsapp/application/ports/in/ProcessWebhookEventPort';
import type { WebhookEventRepositoryPort } from '../../modules/whatsapp/application/ports/out/WebhookEventRepositoryPort';
import { whatsappMessages } from '../../modules/whatsapp/infrastructure/persistence/whatsapp.schema';
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

const REPLY: ModelReply = {
  text: 'Hola, soy el asistente virtual de Saba. Catia queda en la Av. Sucre.',
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
const currentStores = vi.fn<() => Promise<Store[] | null>>();

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

const textMessage = (body: string, wamid = 'wamid.IN1') =>
  customerMessage(wamid, { type: 'text', text: { body } });

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
    sendText.mockReset().mockResolvedValue('wamid.OUT1');
    reply.mockReset().mockResolvedValue(REPLY);
    currentStores.mockReset().mockResolvedValue([CATIA]);
  });

  it('answers with the stores in the instructions and records the turn', async () => {
    await turnOn();

    await receive(textMessage('¿Dónde queda la tienda de Catia?'));
    const run = await waitForRun();

    const [input] = reply.mock.calls[0] ?? [];
    expect(input?.instructions).toContain('asistente virtual de Saba');
    expect(input?.instructions).toContain('Catia');
    expect(input?.instructions).toContain('Av. Sucre');
    expect(input?.turns).toEqual([
      { role: 'user', content: '¿Dónde queda la tienda de Catia?' },
    ]);

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith('584140000001', REPLY.text);

    const sent = await getTestDb()
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.source, 'assistant'));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ body: REPLY.text, sentBy: null });

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
    currentStores.mockResolvedValue(null);

    await receive(textMessage('¿Dónde queda Catia?'));
    await waitForRun();

    const [input] = reply.mock.calls[0] ?? [];
    expect(input?.instructions).toContain('No tienes datos de sedes');
  });

  it('records the failure and sends nothing when the model fails', async () => {
    await turnOn();
    reply.mockRejectedValue(
      new ModelUnavailableError('api_error', 'Anthropic 529: overloaded')
    );

    await receive(textMessage('hola'));
    const run = await waitForRun();

    expect(sendText).not.toHaveBeenCalled();
    expect(run).toMatchObject({
      outcome: 'error',
      reason: 'api_error',
      errorDetail: 'Anthropic 529: overloaded',
      sentMessageId: null,
    });
  });

  it('leaves non-text messages alone', async () => {
    await turnOn();

    await receive(
      customerMessage('wamid.IMG', {
        type: 'image',
        image: { id: 'media-1', mime_type: 'image/jpeg' },
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(reply).not.toHaveBeenCalled();
    expect(await getTestDb().select().from(assistantRuns)).toEqual([]);
  });

  it('does not answer outside the 24 h window', async () => {
    await turnOn();
    now = new Date((CUSTOMER_SENT_AT + 25 * 60 * 60) * 1000);

    await receive(textMessage('hola'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(reply).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });
});
