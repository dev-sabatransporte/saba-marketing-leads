import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import {
  type ApiDb,
  DRIZZLE_CLIENT,
} from '../../../../infrastructure/database/drizzle.module';
import type {
  ChatsRepositoryPort,
  NewOutboundMessage,
} from '../../application/ports/out/ChatsRepositoryPort';
import type { ChatMessage, ConversationSummary } from '../../domain/Chats';
import {
  whatsappContacts,
  whatsappConversations,
  whatsappMessages,
} from './whatsapp.schema';

const PREVIEW_LENGTH = 120;

const conversationColumns = {
  id: whatsappConversations.id,
  status: whatsappConversations.status,
  unreadCount: whatsappConversations.unreadCount,
  lastMessageAt: whatsappConversations.lastMessageAt,
  lastMessagePreview: whatsappConversations.lastMessagePreview,
  lastInboundAt: whatsappConversations.lastInboundAt,
  contactId: whatsappContacts.id,
  waId: whatsappContacts.waId,
  profileName: whatsappContacts.profileName,
  sabaProfileId: whatsappContacts.sabaProfileId,
};

const messageColumns = {
  id: whatsappMessages.id,
  direction: whatsappMessages.direction,
  source: whatsappMessages.source,
  type: whatsappMessages.type,
  body: whatsappMessages.body,
  status: whatsappMessages.status,
  errorDetail: whatsappMessages.errorDetail,
  hasMedia: sql<boolean>`${whatsappMessages.mediaId} is not null`,
  waTimestamp: whatsappMessages.waTimestamp,
};

function toConversation(row: {
  id: string;
  status: 'open' | 'resolved';
  unreadCount: number;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  lastInboundAt: Date | null;
  contactId: string;
  waId: string | null;
  profileName: string | null;
  sabaProfileId: string | null;
}): ConversationSummary {
  return {
    id: row.id,
    contact: {
      id: row.contactId,
      waId: row.waId,
      profileName: row.profileName,
      sabaProfileId: row.sabaProfileId,
    },
    status: row.status,
    unreadCount: row.unreadCount,
    lastMessageAt: row.lastMessageAt,
    lastMessagePreview: row.lastMessagePreview,
    lastInboundAt: row.lastInboundAt,
  };
}

function previewOf(body: string): string {
  const text = body.trim();
  return text.length > PREVIEW_LENGTH
    ? `${text.slice(0, PREVIEW_LENGTH - 1)}…`
    : text;
}

@Injectable()
export class DrizzleChatsRepository implements ChatsRepositoryPort {
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: ApiDb) {}

  async listConversations(limit: number): Promise<ConversationSummary[]> {
    const rows = await this.db
      .select(conversationColumns)
      .from(whatsappConversations)
      .innerJoin(
        whatsappContacts,
        eq(whatsappContacts.id, whatsappConversations.contactId)
      )
      .orderBy(sql`${whatsappConversations.lastMessageAt} desc nulls last`)
      .limit(limit);
    return rows.map(toConversation);
  }

  async getConversation(id: string): Promise<ConversationSummary | null> {
    const [row] = await this.db
      .select(conversationColumns)
      .from(whatsappConversations)
      .innerJoin(
        whatsappContacts,
        eq(whatsappContacts.id, whatsappConversations.contactId)
      )
      .where(eq(whatsappConversations.id, id));
    return row ? toConversation(row) : null;
  }

  async listMessages(
    conversationId: string,
    limit: number
  ): Promise<ChatMessage[]> {
    const rows = await this.db
      .select(messageColumns)
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, conversationId))
      .orderBy(
        desc(whatsappMessages.waTimestamp),
        desc(whatsappMessages.createdAt)
      )
      .limit(limit);
    return rows.reverse();
  }

  /** Message and conversation are the same aggregate: they go in one transaction. */
  async registerOutbound(message: NewOutboundMessage): Promise<ChatMessage> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(whatsappMessages)
        .values({
          conversationId: message.conversationId,
          direction: 'outbound',
          source: message.source,
          type: 'text',
          body: message.body,
          sentBy: message.sentBy,
          status: 'pending',
          waTimestamp: message.waTimestamp,
        })
        .returning(messageColumns);
      if (!created) throw new Error('no se guardó el mensaje');
      await tx
        .update(whatsappConversations)
        .set({
          lastMessageAt: message.waTimestamp,
          lastMessagePreview: previewOf(message.body),
          updatedAt: new Date(),
        })
        .where(eq(whatsappConversations.id, message.conversationId));
      return created;
    });
  }

  async confirmSend(messageId: string, wamid: string): Promise<ChatMessage> {
    // If a Meta status arrived before this response, it was ignored as an unknown
    // wamid: `sent` is the least we know for sure.
    const [message] = await this.db
      .update(whatsappMessages)
      .set({ wamid, status: 'sent' })
      .where(eq(whatsappMessages.id, messageId))
      .returning(messageColumns);
    if (!message) throw new Error('el mensaje enviado desapareció');
    return message;
  }

  async registerSendFailure(
    messageId: string,
    code: string | null,
    detail: string
  ): Promise<void> {
    await this.db
      .update(whatsappMessages)
      .set({
        status: 'failed',
        errorCode: code,
        errorDetail: detail.slice(0, 2000),
      })
      .where(eq(whatsappMessages.id, messageId));
  }

  async mediaIdOf(messageId: string): Promise<string | null | undefined> {
    const [row] = await this.db
      .select({ mediaId: whatsappMessages.mediaId })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.id, messageId));
    return row ? row.mediaId : undefined;
  }

  async lastInboundWamid(conversationId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ wamid: whatsappMessages.wamid })
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.conversationId, conversationId),
          eq(whatsappMessages.direction, 'inbound'),
          isNotNull(whatsappMessages.wamid)
        )
      )
      .orderBy(desc(whatsappMessages.waTimestamp))
      .limit(1);
    return row?.wamid ?? null;
  }

  async markAsRead(conversationId: string): Promise<boolean> {
    const updated = await this.db
      .update(whatsappConversations)
      .set({ unreadCount: 0 })
      .where(eq(whatsappConversations.id, conversationId))
      .returning({ id: whatsappConversations.id });
    return updated.length > 0;
  }
}
