import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
} from 'drizzle-orm';
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
  handoffRequestedAt: whatsappConversations.handoffRequestedAt,
  assignedTo: whatsappConversations.assignedTo,
  assistantPausedAt: whatsappConversations.assistantPausedAt,
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
  handoffRequestedAt: Date | null;
  assignedTo: string | null;
  assistantPausedAt: Date | null;
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
    handoffRequestedAt: row.handoffRequestedAt,
    assignedTo: row.assignedTo,
    assistantPausedAt: row.assistantPausedAt,
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
      // Chats the assistant handed over go first: someone has to pick them up.
      .orderBy(
        sql`${whatsappConversations.handoffRequestedAt} is not null desc`,
        sql`${whatsappConversations.lastMessageAt} desc nulls last`
      )
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
      const c = whatsappConversations;
      await tx
        .update(c)
        .set({
          lastMessageAt: message.waTimestamp,
          lastMessagePreview: previewOf(message.body),
          // A person writing turns the assistant off in this chat, so it does
          // not talk over them; whoever turned it off first stays recorded.
          ...(message.source === 'system'
            ? {
                assistantPausedAt: sql`coalesce(${c.assistantPausedAt}, ${message.waTimestamp.toISOString()}::timestamptz)`,
                assistantPausedBy: sql`coalesce(${c.assistantPausedBy}, ${message.sentBy}::uuid)`,
              }
            : {}),
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

  /** Keeps the first reason: a later failure does not hide why it was handed over. */
  async requestHandoff(
    conversationId: string,
    reason: string,
    at: Date
  ): Promise<void> {
    await this.db
      .update(whatsappConversations)
      .set({ handoffRequestedAt: at, handoffReason: reason, updatedAt: at })
      .where(
        and(
          eq(whatsappConversations.id, conversationId),
          isNull(whatsappConversations.handoffRequestedAt)
        )
      );
  }

  async turnAssistantOff(
    conversationId: string,
    by: string,
    at: Date
  ): Promise<boolean> {
    const updated = await this.db
      .update(whatsappConversations)
      .set({ assistantPausedAt: at, assistantPausedBy: by, updatedAt: at })
      .where(eq(whatsappConversations.id, conversationId))
      .returning({ id: whatsappConversations.id });
    return updated.length > 0;
  }

  /**
   * The assistant takes the chat back: off switch, handoff mark and
   * assignment go, and the chat counts as opened now, so earlier replies by a
   * person no longer keep it silent.
   */
  async turnAssistantOn(conversationId: string, at: Date): Promise<boolean> {
    const updated = await this.db
      .update(whatsappConversations)
      .set({
        assistantPausedAt: null,
        assistantPausedBy: null,
        handoffRequestedAt: null,
        handoffReason: null,
        assignedTo: null,
        assignedAt: null,
        openedAt: at,
        updatedAt: at,
      })
      .where(eq(whatsappConversations.id, conversationId))
      .returning({ id: whatsappConversations.id });
    return updated.length > 0;
  }

  async personRepliedSinceOpened(conversationId: string): Promise<boolean> {
    const [reply] = await this.db
      .select({ id: whatsappMessages.id })
      .from(whatsappMessages)
      .innerJoin(
        whatsappConversations,
        eq(whatsappConversations.id, whatsappMessages.conversationId)
      )
      .where(
        and(
          eq(whatsappMessages.conversationId, conversationId),
          inArray(whatsappMessages.source, ['system', 'phone']),
          gte(whatsappMessages.waTimestamp, whatsappConversations.openedAt)
        )
      )
      .limit(1);
    return reply !== undefined;
  }

  async assistantRepliedSinceOpened(conversationId: string): Promise<boolean> {
    const [reply] = await this.db
      .select({ id: whatsappMessages.id })
      .from(whatsappMessages)
      .innerJoin(
        whatsappConversations,
        eq(whatsappConversations.id, whatsappMessages.conversationId)
      )
      .where(
        and(
          eq(whatsappMessages.conversationId, conversationId),
          eq(whatsappMessages.source, 'assistant'),
          ne(whatsappMessages.status, 'failed'),
          gte(whatsappMessages.waTimestamp, whatsappConversations.openedAt)
        )
      )
      .limit(1);
    return reply !== undefined;
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
