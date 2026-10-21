import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplyToConversationUseCase } from '../../modules/whatsapp/application/use-cases/ReplyToConversationUseCase';
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

function channel(): WhatsAppAssistantChannel {
  const chats = new DrizzleChatsRepository(getTestDb());
  const cloud = {
    sendText,
    downloadMedia: vi.fn(),
    sendTypingIndicator: vi.fn(),
  };
  const clock = { now: () => NOW };
  return new WhatsAppAssistantChannel(
    chats,
    new ReplyToConversationUseCase(chats, cloud, clock)
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
  });

  it('reads the phone, the window and the recent messages of the chat', async () => {
    const conversationId = await createChat(TEN_MINUTES_AGO);

    const chat = await channel().read(conversationId, 20);

    expect(chat).toMatchObject({
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

  it('does not send outside the 24 h window', async () => {
    const conversationId = await createChat(TWO_DAYS_AGO);

    await expect(
      channel().sendAsAssistant(conversationId, 'hola')
    ).rejects.toBeInstanceOf(WindowClosedException);
    expect(sendText).not.toHaveBeenCalled();
  });
});
