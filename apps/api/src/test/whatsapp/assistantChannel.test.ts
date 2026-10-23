import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplyToConversationUseCase } from '../../modules/whatsapp/application/use-cases/ReplyToConversationUseCase';
import { SendTypingIndicatorUseCase } from '../../modules/whatsapp/application/use-cases/SendTypingIndicatorUseCase';
import { MetaSendError } from '../../modules/whatsapp/domain/Chats';
import { WindowClosedException } from '../../modules/whatsapp/domain/exceptions/whatsappExceptions';
import { WhatsAppAssistantChannel } from '../../modules/whatsapp/infrastructure/assistant/WhatsAppAssistantChannel';
import { DrizzleChatsRepository } from '../../modules/whatsapp/infrastructure/persistence/DrizzleChatsRepository';
import {
  whatsappContacts,
  whatsappConversations,
  whatsappMessages,
} from '../../modules/whatsapp/infrastructure/persistence/whatsapp.schema';
import { closeTestDb, getTestDb, resetDatabase } from '../support/testDatabase';

const NOW = new Date('2026-10-21T15:00:00Z');
const TEN_MINUTES_AGO = new Date(NOW.getTime() - 10 * 60 * 1000);
const TWO_DAYS_AGO = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);

const sendText = vi.fn<(to: string, body: string) => Promise<string>>();
const sendTypingIndicator = vi.fn<(wamid: string) => Promise<void>>();

function channel(): WhatsAppAssistantChannel {
  const chats = new DrizzleChatsRepository(getTestDb());
  const cloud = {
    sendText,
    downloadMedia: vi.fn(),
    sendTypingIndicator,
  };
  const clock = { now: () => NOW };
  return new WhatsAppAssistantChannel(
    chats,
    new ReplyToConversationUseCase(chats, cloud, clock),
    new SendTypingIndicatorUseCase(chats, cloud, clock),
    clock
  );
}

async function createChat(lastInboundAt: Date): Promise<string> {
  const db = getTestDb();
  const [contact] = await db
    .insert(whatsappContacts)
    .values({ waId: '584140000001', profileName: 'Cliente' })
    .returning();
  if (!contact) throw new Error('sin contacto');
  const [conversation] = await db
    .insert(whatsappConversations)
    .values({
      contactId: contact.id,
      openedAt: lastInboundAt,
      lastInboundAt,
      lastMessageAt: lastInboundAt,
    })
    .returning();
  if (!conversation) throw new Error('sin conversación');
  await db.insert(whatsappMessages).values({
    conversationId: conversation.id,
    wamid: 'wamid.IN',
    direction: 'inbound',
    source: 'customer',
    type: 'text',
    body: '¿Dónde queda Catia?',
    waTimestamp: lastInboundAt,
  });
  return conversation.id;
}

describe('WhatsAppAssistantChannel (against Postgres)', () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetDatabase();
    sendText.mockReset();
    sendTypingIndicator.mockReset().mockResolvedValue(undefined);
  });

  it('shows "escribiendo" on the customer\'s last message', async () => {
    const conversationId = await createChat(TEN_MINUTES_AGO);

    await channel().showTyping(conversationId);

    expect(sendTypingIndicator).toHaveBeenCalledWith('wamid.IN');
  });

  it('a typing indicator Meta rejects never gets in the way of the reply', async () => {
    const conversationId = await createChat(TEN_MINUTES_AGO);
    sendTypingIndicator.mockRejectedValue(
      new MetaSendError(131000, 'algo falló')
    );

    await expect(channel().showTyping(conversationId)).resolves.toBeUndefined();
  });

  it('reads the phone, the window and the recent messages of the chat', async () => {
    const conversationId = await createChat(TEN_MINUTES_AGO);

    const chat = await channel().read(conversationId, 20);

    expect(chat).toMatchObject({
      handoffRequestedAt: null,
      waId: '584140000001',
      lastInboundAt: TEN_MINUTES_AGO,
      messages: [{ source: 'customer', body: '¿Dónde queda Catia?' }],
    });
    expect(await channel().read(crypto.randomUUID(), 20)).toBeNull();
  });

  it('sends as the assistant: source assistant, no person behind it', async () => {
    const conversationId = await createChat(TEN_MINUTES_AGO);
    sendText.mockResolvedValue('wamid.OUT');

    const sent = await channel().sendAsAssistant(
      conversationId,
      'Queda en la Av. Sucre'
    );

    expect(sendText).toHaveBeenCalledWith(
      '584140000001',
      'Queda en la Av. Sucre'
    );
    expect(sent).toMatchObject({ source: 'assistant', status: 'sent' });
    const [row] = await getTestDb()
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.id, sent.id));
    expect(row).toMatchObject({
      source: 'assistant',
      sentBy: null,
      wamid: 'wamid.OUT',
    });
  });

  it('marks the chat for an agent once, keeping the first reason', async () => {
    const conversationId = await createChat(TEN_MINUTES_AGO);

    await channel().requestHandoff(conversationId, 'pricing');
    await channel().requestHandoff(conversationId, 'error');

    const [row] = await getTestDb()
      .select()
      .from(whatsappConversations)
      .where(eq(whatsappConversations.id, conversationId));
    expect(row).toMatchObject({
      handoffRequestedAt: NOW,
      handoffReason: 'pricing',
      assignedTo: null,
    });
    expect(await channel().read(conversationId, 20)).toMatchObject({
      handoffRequestedAt: NOW,
    });
  });

  it('tells whether a person is attending: assigned, replied since it opened or paused', async () => {
    const conversationId = await createChat(TEN_MINUTES_AGO);
    expect(await channel().read(conversationId, 20)).toMatchObject({
      assigned: false,
      personReplied: false,
      assistantPaused: false,
    });

    await getTestDb().insert(whatsappMessages).values({
      conversationId,
      direction: 'outbound',
      source: 'phone',
      type: 'text',
      body: 'te escribo desde el celular',
      waTimestamp: NOW,
    });
    await getTestDb()
      .update(whatsappConversations)
      .set({
        assignedTo: '11111111-1111-1111-1111-111111111111',
        assistantPausedAt: NOW,
      })
      .where(eq(whatsappConversations.id, conversationId));

    expect(await channel().read(conversationId, 20)).toMatchObject({
      assigned: true,
      personReplied: true,
      assistantPaused: true,
    });
  });

  it('forgets a person reply from before the chat was reopened', async () => {
    const conversationId = await createChat(TEN_MINUTES_AGO);
    await getTestDb().insert(whatsappMessages).values({
      conversationId,
      direction: 'outbound',
      source: 'system',
      type: 'text',
      body: 'listo, ya te atendí',
      waTimestamp: TEN_MINUTES_AGO,
    });
    await getTestDb()
      .update(whatsappConversations)
      .set({ openedAt: NOW })
      .where(eq(whatsappConversations.id, conversationId));

    expect(await channel().read(conversationId, 20)).toMatchObject({
      personReplied: false,
    });
  });

  it('tells whether the assistant already replied since the chat was (re)opened', async () => {
    const conversationId = await createChat(TEN_MINUTES_AGO);
    const assistantReply = (status: 'sent' | 'failed', waTimestamp: Date) =>
      getTestDb().insert(whatsappMessages).values({
        conversationId,
        direction: 'outbound',
        source: 'assistant',
        type: 'text',
        body: 'Catia queda en la Av. Sucre.',
        status,
        waTimestamp,
      });
    expect(await channel().read(conversationId, 20)).toMatchObject({
      assistantRepliedSinceOpened: false,
    });

    // The customer never read a reply that failed.
    await assistantReply('failed', NOW);
    expect(await channel().read(conversationId, 20)).toMatchObject({
      assistantRepliedSinceOpened: false,
    });

    await assistantReply('sent', NOW);
    expect(await channel().read(conversationId, 20)).toMatchObject({
      assistantRepliedSinceOpened: true,
    });

    await getTestDb()
      .update(whatsappConversations)
      .set({ openedAt: new Date(NOW.getTime() + 1000) })
      .where(eq(whatsappConversations.id, conversationId));
    expect(await channel().read(conversationId, 20)).toMatchObject({
      assistantRepliedSinceOpened: false,
    });
  });

  it('does not send outside the 24 h window', async () => {
    const conversationId = await createChat(TWO_DAYS_AGO);

    await expect(
      channel().sendAsAssistant(conversationId, 'hola')
    ).rejects.toBeInstanceOf(WindowClosedException);
    expect(sendText).not.toHaveBeenCalled();
  });
});
