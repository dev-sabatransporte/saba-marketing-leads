import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ProcessWebhookEventUseCase } from '../../modules/whatsapp/application/use-cases/ProcessWebhookEventUseCase';
import {
  MAX_ATTEMPTS,
  ReprocessPendingUseCase,
} from '../../modules/whatsapp/application/use-cases/ReprocessPendingUseCase';
import type { StoredInboundMessage } from '../../modules/whatsapp/domain/events/InboundMessageStored';
import { extractChanges } from '../../modules/whatsapp/domain/WebhookChange';
import { DrizzleInboxUnitOfWork } from '../../modules/whatsapp/infrastructure/persistence/DrizzleInboxUnitOfWork';
import { DrizzleWebhookEventRepository } from '../../modules/whatsapp/infrastructure/persistence/DrizzleWebhookEventRepository';
import {
  whatsappContacts,
  whatsappConversations,
  whatsappMessages,
  whatsappWebhookEvents,
} from '../../modules/whatsapp/infrastructure/persistence/whatsapp.schema';
import inboundTextMessage from '../fixtures/whatsapp/inboundTextMessage.json';
import { closeTestDb, getTestDb, resetDatabase } from '../support/testDatabase';

const db = () => getTestDb();
const events = () => new DrizzleWebhookEventRepository(db());
let announced: StoredInboundMessage[] = [];
const process = () =>
  new ProcessWebhookEventUseCase(new DrizzleInboxUnitOfWork(db()), events(), {
    publishStored: (messages) => {
      announced.push(...messages);
    },
  });

async function saveEvent(field: string, payload: unknown): Promise<string> {
  const [id] = await events().save([{ field, payload }]);
  if (!id) throw new Error('no se guardó el evento');
  return id;
}

async function saveFixture(): Promise<string> {
  const [change] = extractChanges(inboundTextMessage);
  if (!change) throw new Error('fixture vacío');
  return saveEvent(change.field, change.payload);
}

function textMessage(
  wamid: string,
  timestamp: number,
  identity: { from?: string; from_user_id?: string },
  body = 'hola'
): unknown {
  return {
    messages: [
      {
        id: wamid,
        ...identity,
        timestamp: String(timestamp),
        type: 'text',
        text: { body },
      },
    ],
  };
}

const T0 = 1791403246;

describe('ProcesarWebhookEventoUseCase (contra Postgres)', () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetDatabase();
    announced = [];
  });

  it('creates contact, conversation and message from the real webhook, and marks the event', async () => {
    const eventId = await saveFixture();

    expect(await process().execute(eventId)).toBe('processed');

    const contact = await db().query.whatsappContacts.findFirst({
      with: { conversation: { with: { messages: true } } },
    });
    expect(contact).toMatchObject({
      waId: '584140000001',
      userId: 'VE.0000000000000001',
      profileName: 'Cliente Prueba',
      conversation: {
        status: 'open',
        unreadCount: 1,
        lastMessagePreview: 'hola prueba',
        lastInboundAt: new Date(T0 * 1000),
        lastMessageAt: new Date(T0 * 1000),
      },
    });
    expect(contact?.conversation?.messages).toMatchObject([
      {
        wamid: 'wamid.FIXTURE_INBOUND_TEXT',
        direction: 'inbound',
        source: 'customer',
        type: 'text',
        body: 'hola prueba',
      },
    ]);
    const [event] = await db()
      .select()
      .from(whatsappWebhookEvents)
      .where(eq(whatsappWebhookEvents.id, eventId));
    expect(event?.processedAt).not.toBeNull();
  });

  it('duplicates nothing if Meta resends the same message or the event is processed twice', async () => {
    const first = await saveFixture();
    await process().execute(first);

    expect(await process().execute(first)).toBe('skipped');
    const resend = await saveFixture();
    expect(await process().execute(resend)).toBe('processed');

    expect(await db().select().from(whatsappMessages)).toHaveLength(1);
    const [conversation] = await db().select().from(whatsappConversations);
    expect(conversation?.unreadCount).toBe(1);
  });

  it('announces each new inbound message once, after it is saved', async () => {
    const eventId = await saveFixture();
    await process().execute(eventId);

    const message = await db().query.whatsappMessages.findFirst();
    expect(announced).toEqual([
      {
        conversationId: message?.conversationId,
        messageId: message?.id,
        type: 'text',
      },
    ]);

    // Meta resends the same wamid: nothing new to announce.
    await process().execute(await saveFixture());
    expect(announced).toHaveLength(1);
  });

  it('announces nothing if the event fails', async () => {
    const eventId = await saveEvent('messages', {
      messages: 'no es una lista',
    });
    expect(await process().execute(eventId)).toBe('failed');
    expect(announced).toEqual([]);
  });

  it('recognizes the same customer when later only their user_id arrives', async () => {
    await process().execute(
      await saveEvent(
        'messages',
        textMessage('wamid.1', T0, {
          from: '584140000001',
          from_user_id: 'VE.1',
        })
      )
    );
    await process().execute(
      await saveEvent(
        'messages',
        textMessage('wamid.2', T0 + 60, { from_user_id: 'VE.1' })
      )
    );

    expect(await db().select().from(whatsappContacts)).toHaveLength(1);
    expect(await db().select().from(whatsappMessages)).toHaveLength(2);
  });

  it('fills in the user_id of a contact that only had a phone', async () => {
    await process().execute(
      await saveEvent(
        'messages',
        textMessage('wamid.1', T0, { from: '584140000001' })
      )
    );
    await process().execute(
      await saveEvent(
        'messages',
        textMessage('wamid.2', T0 + 60, {
          from: '584140000001',
          from_user_id: 'VE.1',
        })
      )
    );

    const contacts = await db().select().from(whatsappContacts);
    expect(contacts).toMatchObject([{ waId: '584140000001', userId: 'VE.1' }]);
  });

  it('reopens a resolved conversation and a late message does not overwrite the preview', async () => {
    await process().execute(
      await saveEvent(
        'messages',
        textMessage('wamid.new', T0 + 60, { from: '584140000001' }, 'último')
      )
    );
    await db()
      .update(whatsappConversations)
      .set({ status: 'resolved', unreadCount: 0 });

    await process().execute(
      await saveEvent(
        'messages',
        textMessage('wamid.old', T0, { from: '584140000001' }, 'anterior')
      )
    );

    const [conversation] = await db().select().from(whatsappConversations);
    expect(conversation).toMatchObject({
      status: 'open',
      // Reopened: a person's reply before this no longer counts as attending it.
      openedAt: new Date(T0 * 1000),
      unreadCount: 1,
      lastMessagePreview: 'último',
      lastMessageAt: new Date((T0 + 60) * 1000),
      lastInboundAt: new Date((T0 + 60) * 1000),
    });
  });

  it('advances the status of an outbound message without going backwards', async () => {
    await process().execute(
      await saveEvent(
        'messages',
        textMessage('wamid.in', T0, { from: '584140000001' })
      )
    );
    const [conversation] = await db().select().from(whatsappConversations);
    if (!conversation) throw new Error('sin conversación');
    await db().insert(whatsappMessages).values({
      conversationId: conversation.id,
      wamid: 'wamid.out',
      direction: 'outbound',
      source: 'system',
      type: 'text',
      body: 'reply',
      status: 'sent',
      waTimestamp: new Date(),
    });

    for (const status of ['read', 'delivered', 'sent']) {
      await process().execute(
        await saveEvent('messages', {
          statuses: [{ id: 'wamid.out', status }],
        })
      );
    }

    const [outbound] = await db()
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.wamid, 'wamid.out'));
    expect(outbound?.status).toBe('read');
  });

  it('leaves the event unprocessed, with the reason, if the payload is unusable', async () => {
    const eventId = await saveEvent('messages', {
      messages: [{ id: 'wamid.X', timestamp: '1', type: 'text' }],
    });

    expect(await process().execute(eventId)).toBe('failed');

    const [event] = await db()
      .select()
      .from(whatsappWebhookEvents)
      .where(eq(whatsappWebhookEvents.id, eventId));
    expect(event).toMatchObject({ processedAt: null, attempts: 1 });
    expect(event?.error).toContain('WHATSAPP_INVALID_WEBHOOK_PAYLOAD');
    expect(await db().select().from(whatsappContacts)).toEqual([]);
  });
});

describe('ReprocesarPendientesUseCase (contra Postgres)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('processes the pending ones and stops retrying those that used up their attempts', async () => {
    const pending = await saveFixture();
    const exhausted = await saveEvent('account_update', {});
    await db()
      .update(whatsappWebhookEvents)
      .set({ attempts: MAX_ATTEMPTS })
      .where(eq(whatsappWebhookEvents.id, exhausted));

    const processed = await new ReprocessPendingUseCase(
      events(),
      process()
    ).execute();

    expect(processed).toBe(1);
    const rows = await db().select().from(whatsappWebhookEvents);
    expect(rows.find((f) => f.id === pending)?.processedAt).not.toBeNull();
    expect(rows.find((f) => f.id === exhausted)?.processedAt).toBeNull();
  });
});
