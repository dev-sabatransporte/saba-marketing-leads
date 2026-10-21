import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
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
import type { AuthenticatedUser } from '../../modules/auth/domain/AuthSession';
import { SabaForbiddenException } from '../../modules/sabaCustomers/domain/exceptions/sabaCustomersExceptions';
import type { SabaCustomer } from '../../modules/sabaCustomers/domain/SabaCustomer';
import { SABA_CUSTOMERS_TOKENS } from '../../modules/sabaCustomers/tokens';
import {
  type MediaFile,
  MetaSendError,
} from '../../modules/whatsapp/domain/Chats';
import {
  whatsappContacts,
  whatsappConversations,
  whatsappMessages,
} from '../../modules/whatsapp/infrastructure/persistence/whatsapp.schema';
import { WhatsAppModule } from '../../modules/whatsapp/module';
import { WHATSAPP_TOKENS } from '../../modules/whatsapp/tokens';
import { ZodValidationPipe } from '../../shared/pipes/zodValidationPipe';
import {
  closeTestDb,
  getTestDb,
  resetDatabase,
  testDatabaseUrl,
} from '../support/testDatabase';

process.env.DATABASE = testDatabaseUrl();

const NOW = new Date('2026-10-07T20:00:00Z');
const ONE_HOUR_AGO = new Date(NOW.getTime() - 60 * 60 * 1000);
const TWO_DAYS_AGO = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);
const AGENT: AuthenticatedUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'agente@sabatransporte.com',
  name: 'Agente',
  role: 'admin',
  permissions: ['marketing:access'],
};

const sendText = vi.fn<(to: string, body: string) => Promise<string>>();
const downloadMedia = vi.fn<(mediaId: string) => Promise<MediaFile>>();
const sendTypingIndicator = vi.fn<(wamid: string) => Promise<void>>();
const findByPhone =
  vi.fn<(phone: string, credential: string) => Promise<SabaCustomer[]>>();

function file(mimeType: string, content: string): MediaFile {
  const bytes = new TextEncoder().encode(content);
  return {
    mimeType,
    size: bytes.length,
    content: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  };
}

async function createChat(data: {
  waId?: string | null;
  userId?: string | null;
  lastInboundAt: Date | null;
  lastMessageAt?: Date;
  unreadCount?: number;
}): Promise<string> {
  const db = getTestDb();
  const [contact] = await db
    .insert(whatsappContacts)
    .values({
      waId: data.waId === undefined ? '584140000001' : data.waId,
      userId: data.userId ?? null,
      profileName: 'Cliente',
    })
    .returning();
  if (!contact) throw new Error('sin contacto');
  const [conversation] = await db
    .insert(whatsappConversations)
    .values({
      contactId: contact.id,
      lastInboundAt: data.lastInboundAt,
      lastMessageAt: data.lastMessageAt ?? data.lastInboundAt,
      unreadCount: data.unreadCount ?? 0,
    })
    .returning();
  if (!conversation) throw new Error('sin conversación');
  return conversation.id;
}

describe('WhatsApp chats (API)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggingModule,
        ErrorsModule,
        DrizzleModule,
        BusModule,
        WhatsAppModule,
      ],
    })
      .overrideProvider(WHATSAPP_TOKENS.WhatsAppCloud)
      .useValue({ sendText, downloadMedia, sendTypingIndicator })
      .overrideProvider(SABA_CUSTOMERS_TOKENS.Reader)
      .useValue({ findByPhone })
      .overrideProvider(WHATSAPP_TOKENS.Clock)
      .useValue({ now: () => NOW })
      .compile();

    app = moduleRef.createNestApplication();
    // What the AuthGuard leaves in the real app.
    app.use(
      (
        req: Request & { user?: AuthenticatedUser },
        _res: Response,
        next: NextFunction
      ) => {
        req.user = AGENT;
        next();
      }
    );
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetDatabase();
    sendText.mockReset();
    downloadMedia.mockReset();
    sendTypingIndicator.mockReset();
    findByPhone.mockReset();
  });

  it('lists the conversations with the most recently active first and their window', async () => {
    const old = await createChat({
      waId: '584140000001',
      lastInboundAt: TWO_DAYS_AGO,
    });
    const recent = await createChat({
      waId: '584140000002',
      lastInboundAt: ONE_HOUR_AGO,
      unreadCount: 2,
    });

    const res = await request(app.getHttpServer()).get(
      '/whatsapp/conversations'
    );

    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { id: string }) => c.id)).toEqual([
      recent,
      old,
    ]);
    expect(res.body.data[0]).toMatchObject({
      unreadCount: 2,
      contact: {
        phone: '584140000002',
        whatsAppName: 'Cliente',
        linkedToSaba: false,
      },
      windowExpiresAt: new Date(
        ONE_HOUR_AGO.getTime() + 24 * 3600 * 1000
      ).toISOString(),
    });
  });

  it('puts the chats the assistant handed over first, marked as needing an agent', async () => {
    const recent = await createChat({
      waId: '584140000002',
      lastInboundAt: ONE_HOUR_AGO,
    });
    const handedOver = await createChat({
      waId: '584140000001',
      lastInboundAt: TWO_DAYS_AGO,
    });
    await getTestDb()
      .update(whatsappConversations)
      .set({ handoffRequestedAt: ONE_HOUR_AGO, handoffReason: 'pricing' })
      .where(eq(whatsappConversations.id, handedOver));

    const res = await request(app.getHttpServer()).get(
      '/whatsapp/conversations'
    );

    expect(
      res.body.data.map((c: { id: string; needsAgent: boolean }) => [
        c.id,
        c.needsAgent,
      ])
    ).toEqual([
      [handedOver, true],
      [recent, false],
    ]);
  });

  it('returns the messages in chronological order and 404 if the conversation does not exist', async () => {
    const id = await createChat({ lastInboundAt: ONE_HOUR_AGO });
    await getTestDb()
      .insert(whatsappMessages)
      .values([
        {
          conversationId: id,
          wamid: 'w2',
          direction: 'inbound',
          source: 'customer',
          type: 'text',
          body: 'segundo',
          waTimestamp: ONE_HOUR_AGO,
        },
        {
          conversationId: id,
          wamid: 'w1',
          direction: 'inbound',
          source: 'customer',
          type: 'text',
          body: 'primero',
          waTimestamp: TWO_DAYS_AGO,
        },
      ]);

    const res = await request(app.getHttpServer()).get(
      `/whatsapp/conversations/${id}/messages`
    );
    const missing = await request(app.getHttpServer()).get(
      '/whatsapp/conversations/00000000-0000-0000-0000-000000000000/messages'
    );

    expect(res.body.data.map((m: { body: string }) => m.body)).toEqual([
      'primero',
      'segundo',
    ]);
    expect(missing.status).toBe(404);
  });

  it('replies within the window: sends to Meta and saves the message as sent', async () => {
    const id = await createChat({ lastInboundAt: ONE_HOUR_AGO });
    sendText.mockResolvedValue('wamid.REPLY');

    const res = await request(app.getHttpServer())
      .post(`/whatsapp/conversations/${id}/messages`)
      .send({ body: '  Hola, ¿en qué te ayudo?  ' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      direction: 'outbound',
      source: 'system',
      body: 'Hola, ¿en qué te ayudo?',
      status: 'sent',
    });
    expect(sendText).toHaveBeenCalledWith(
      '584140000001',
      'Hola, ¿en qué te ayudo?'
    );
    const [saved] = await getTestDb().select().from(whatsappMessages);
    expect(saved).toMatchObject({
      wamid: 'wamid.REPLY',
      sentBy: AGENT.id,
    });
    const [conversation] = await getTestDb()
      .select()
      .from(whatsappConversations);
    expect(conversation?.lastMessagePreview).toBe('Hola, ¿en qué te ayudo?');
  });

  it('does not send with the 24 h window closed', async () => {
    const id = await createChat({ lastInboundAt: TWO_DAYS_AGO });

    const res = await request(app.getHttpServer())
      .post(`/whatsapp/conversations/${id}/messages`)
      .send({ body: 'Hola' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('WHATSAPP_WINDOW_CLOSED');
    expect(sendText).not.toHaveBeenCalled();
    expect(await getTestDb().select().from(whatsappMessages)).toEqual([]);
  });

  it('leaves the message as failed and explains the error if Meta rejects it', async () => {
    const id = await createChat({ lastInboundAt: ONE_HOUR_AGO });
    sendText.mockRejectedValue(
      new MetaSendError(131030, 'Recipient phone number not in allowed list')
    );

    const res = await request(app.getHttpServer())
      .post(`/whatsapp/conversations/${id}/messages`)
      .send({ body: 'Hola' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('WHATSAPP_RECIPIENT_NOT_ALLOWED');
    expect(res.body.error).toContain('destinatarios permitidos');
    const [saved] = await getTestDb().select().from(whatsappMessages);
    expect(saved).toMatchObject({
      status: 'failed',
      errorCode: '131030',
      errorDetail: 'Recipient phone number not in allowed list',
    });
  });

  it('does not reply to a contact who only shares their username', async () => {
    const id = await createChat({
      waId: null,
      userId: 'VE.1',
      lastInboundAt: ONE_HOUR_AGO,
    });

    const res = await request(app.getHttpServer())
      .post(`/whatsapp/conversations/${id}/messages`)
      .send({ body: 'Hola' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('WHATSAPP_CONTACT_WITHOUT_PHONE');
  });

  it('rejects an empty message', async () => {
    const id = await createChat({ lastInboundAt: ONE_HOUR_AGO });

    const res = await request(app.getHttpServer())
      .post(`/whatsapp/conversations/${id}/messages`)
      .send({ body: '   ' });

    expect(res.status).toBe(400);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('marks the conversation as read', async () => {
    const id = await createChat({
      lastInboundAt: ONE_HOUR_AGO,
      unreadCount: 3,
    });

    const res = await request(app.getHttpServer()).post(
      `/whatsapp/conversations/${id}/read`
    );

    expect(res.status).toBe(200);
    const [conversation] = await getTestDb()
      .select()
      .from(whatsappConversations)
      .where(eq(whatsappConversations.id, id));
    expect(conversation?.unreadCount).toBe(0);
  });

  describe('message files', () => {
    let contacts = 0;
    async function messageWithMedia(
      type: string,
      mediaId: string | null
    ): Promise<string> {
      contacts++;
      const conversationId = await createChat({
        waId: `58414000${String(contacts).padStart(4, '0')}`,
        lastInboundAt: ONE_HOUR_AGO,
      });
      const [message] = await getTestDb()
        .insert(whatsappMessages)
        .values({
          conversationId,
          wamid: `w-${type}`,
          direction: 'inbound',
          source: 'customer',
          type,
          mediaId,
          waTimestamp: ONE_HOUR_AGO,
        })
        .returning();
      if (!message) throw new Error('sin mensaje');
      return message.id;
    }

    it('marks which messages have a file', async () => {
      const id = await messageWithMedia('image', 'MEDIA1');
      const [{ conversationId }] = await getTestDb()
        .select({ conversationId: whatsappMessages.conversationId })
        .from(whatsappMessages)
        .where(eq(whatsappMessages.id, id));

      const res = await request(app.getHttpServer()).get(
        `/whatsapp/conversations/${conversationId}/messages`
      );

      expect(res.body.data[0]).toMatchObject({
        type: 'image',
        hasMedia: true,
      });
    });

    it('passes the Meta image through as-is, to show it in the panel', async () => {
      const id = await messageWithMedia('image', 'MEDIA1');
      downloadMedia.mockResolvedValue(file('image/jpeg', 'photo-bytes'));

      const res = await request(app.getHttpServer())
        .get(`/whatsapp/messages/${id}/media`)
        .buffer(true)
        .parse((r, done) => {
          let data = '';
          r.on('data', (c: Buffer) => {
            data += c.toString();
          });
          r.on('end', () => done(null, data));
        });

      expect(res.status).toBe(200);
      expect(downloadMedia).toHaveBeenCalledWith('MEDIA1');
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['content-disposition']).toBe('inline');
      expect(res.headers['cache-control']).toBe('private, max-age=3600');
      expect(res.body).toBe('photo-bytes');
    });

    it('serves as a download whatever could run code in the browser', async () => {
      const id = await messageWithMedia('document', 'MEDIA2');
      downloadMedia.mockResolvedValue(
        file('text/html', '<script>alert(1)</script>')
      );

      const res = await request(app.getHttpServer()).get(
        `/whatsapp/messages/${id}/media`
      );

      expect(res.headers['content-disposition']).toBe('attachment');
      expect(res.headers['content-security-policy']).toContain('sandbox');
    });

    it('answers 404 if the message has no file or Meta no longer keeps it', async () => {
      const withoutFile = await messageWithMedia('text', null);
      const expired = await messageWithMedia('image', 'MEDIA_VIEJO');
      downloadMedia.mockRejectedValue(
        new MetaSendError(100, 'Unsupported get request')
      );

      const a = await request(app.getHttpServer()).get(
        `/whatsapp/messages/${withoutFile}/media`
      );
      const b = await request(app.getHttpServer()).get(
        `/whatsapp/messages/${expired}/media`
      );

      expect(a.status).toBe(404);
      expect(b.status).toBe(404);
      expect(b.body.code).toBe('WHATSAPP_MEDIA_UNAVAILABLE');
    });
  });

  describe('typing indicator', () => {
    async function inbound(
      conversationId: string,
      wamid: string,
      when: Date
    ): Promise<void> {
      await getTestDb().insert(whatsappMessages).values({
        conversationId,
        wamid,
        direction: 'inbound',
        source: 'customer',
        type: 'text',
        body: 'hola',
        waTimestamp: when,
      });
    }

    it('sends it to Meta with the customer last message', async () => {
      const id = await createChat({ lastInboundAt: ONE_HOUR_AGO });
      await inbound(id, 'wamid.old', TWO_DAYS_AGO);
      await inbound(id, 'wamid.last', ONE_HOUR_AGO);
      sendTypingIndicator.mockResolvedValue();

      const res = await request(app.getHttpServer()).post(
        `/whatsapp/conversations/${id}/typing`
      );

      expect(res.status).toBe(200);
      expect(sendTypingIndicator).toHaveBeenCalledWith('wamid.last');
    });

    it('does nothing with the window closed', async () => {
      const id = await createChat({ lastInboundAt: TWO_DAYS_AGO });
      await inbound(id, 'wamid.old', TWO_DAYS_AGO);

      const res = await request(app.getHttpServer()).post(
        `/whatsapp/conversations/${id}/typing`
      );

      expect(res.status).toBe(200);
      expect(sendTypingIndicator).not.toHaveBeenCalled();
    });

    it('answers 200 even if Meta rejects it: it is only a courtesy', async () => {
      const id = await createChat({ lastInboundAt: ONE_HOUR_AGO });
      await inbound(id, 'wamid.last', ONE_HOUR_AGO);
      sendTypingIndicator.mockRejectedValue(
        new MetaSendError(100, 'Invalid parameter')
      );

      const res = await request(app.getHttpServer()).post(
        `/whatsapp/conversations/${id}/typing`
      );

      expect(res.status).toBe(200);
    });
  });

  describe('chat Saba customer', () => {
    const ana: SabaCustomer = {
      id: 'p1',
      name: 'Ana Pérez',
      idNumber: 'V12345678',
      email: null,
      phone: '04140000001',
      city: 'Caracas',
      source: 'web',
      customerSince: '2026-01-01T00:00:00Z',
      applications: [],
    };

    it('searches Saba with the chat phone and the agent session', async () => {
      const id = await createChat({ lastInboundAt: ONE_HOUR_AGO });
      findByPhone.mockResolvedValue([ana]);

      const res = await request(app.getHttpServer())
        .get(`/whatsapp/conversations/${id}/saba-customer`)
        .set('Authorization', 'Bearer agent-token');

      expect(res.status).toBe(200);
      expect(findByPhone).toHaveBeenCalledWith('584140000001', 'agent-token');
      expect(res.body.data).toEqual({ noPhone: false, customers: [ana] });
    });

    it('does not query Saba if the contact only shares their username', async () => {
      const id = await createChat({
        waId: null,
        userId: 'VE.1',
        lastInboundAt: ONE_HOUR_AGO,
      });

      const res = await request(app.getHttpServer())
        .get(`/whatsapp/conversations/${id}/saba-customer`)
        .set('Authorization', 'Bearer t');

      expect(res.body.data).toEqual({ noPhone: true, customers: [] });
      expect(findByPhone).not.toHaveBeenCalled();
    });

    it('explains when Saba does not give the agent permission', async () => {
      const id = await createChat({ lastInboundAt: ONE_HOUR_AGO });
      findByPhone.mockRejectedValue(new SabaForbiddenException());

      const res = await request(app.getHttpServer())
        .get(`/whatsapp/conversations/${id}/saba-customer`)
        .set('Authorization', 'Bearer t');

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SABA_CUSTOMERS_FORBIDDEN');
    });
  });
});
