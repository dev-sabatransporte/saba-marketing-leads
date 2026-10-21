import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import {
  type ApiDb,
  DRIZZLE_CLIENT,
} from '../../../../infrastructure/database/drizzle.module';
import type {
  InboxTxScope,
  InboxUnitOfWork,
  PendingWebhookEvent,
} from '../../application/ports/out/InboxUnitOfWork';
import type {
  ContactIdentity,
  InboundMessage,
  MessageStatus,
  MessageStatusChange,
} from '../../domain/Inbox';
import {
  whatsappContacts,
  whatsappConversations,
  whatsappMessages,
  whatsappWebhookEvents,
} from './whatsapp.schema';

type ApiTx = Parameters<Parameters<ApiDb['transaction']>[0]>[0];

class DrizzleInboxScope implements InboxTxScope {
  constructor(private readonly tx: ApiTx) {}

  async claimEvent(eventId: string): Promise<PendingWebhookEvent | null> {
    const [event] = await this.tx
      .select({
        id: whatsappWebhookEvents.id,
        field: whatsappWebhookEvents.field,
        payload: whatsappWebhookEvents.payload,
      })
      .from(whatsappWebhookEvents)
      .where(
        and(
          eq(whatsappWebhookEvents.id, eventId),
          isNull(whatsappWebhookEvents.processedAt)
        )
      )
      .for('update', { skipLocked: true });
    return event ?? null;
  }

  async markProcessed(eventId: string): Promise<void> {
    await this.tx
      .update(whatsappWebhookEvents)
      .set({ processedAt: new Date(), error: null })
      .where(eq(whatsappWebhookEvents.id, eventId));
  }

  async ensureContact(
    { waId, userId }: ContactIdentity,
    profileName: string | null
  ): Promise<string> {
    const matches: SQL[] = [];
    if (userId) matches.push(eq(whatsappContacts.userId, userId));
    if (waId) matches.push(eq(whatsappContacts.waId, waId));

    const existing = await this.tx
      .select({
        id: whatsappContacts.id,
        waId: whatsappContacts.waId,
        userId: whatsappContacts.userId,
      })
      .from(whatsappContacts)
      .where(or(...matches))
      .limit(2);

    if (existing.length === 0) {
      const [created] = await this.tx
        .insert(whatsappContacts)
        .values({ waId, userId, profileName })
        .returning({ id: whatsappContacts.id });
      if (!created) throw new Error('no se creó el contacto');
      return created.id;
    }

    // If the phone and the user_id land on different contacts, the user_id one is
    // used and nothing is filled in: merging them would break the UNIQUE.
    const byUserId = existing.find((c) => userId && c.userId === userId);
    const contact = byUserId ?? existing[0];
    if (!contact) throw new Error('contacto inconsistente');
    const complete = existing.length === 1;

    await this.tx
      .update(whatsappContacts)
      .set({
        ...(complete && !contact.waId && waId ? { waId } : {}),
        ...(complete && !contact.userId && userId ? { userId } : {}),
        ...(profileName ? { profileName } : {}),
        updatedAt: new Date(),
      })
      .where(eq(whatsappContacts.id, contact.id));
    return contact.id;
  }

  async ensureConversation(contactId: string): Promise<string> {
    await this.tx
      .insert(whatsappConversations)
      .values({ contactId })
      .onConflictDoNothing({ target: whatsappConversations.contactId });
    const [conversation] = await this.tx
      .select({ id: whatsappConversations.id })
      .from(whatsappConversations)
      .where(eq(whatsappConversations.contactId, contactId));
    if (!conversation) throw new Error('no se creó la conversación');
    return conversation.id;
  }

  async insertInboundMessage(
    conversationId: string,
    message: InboundMessage
  ): Promise<string | null> {
    const [inserted] = await this.tx
      .insert(whatsappMessages)
      .values({
        conversationId,
        wamid: message.wamid,
        direction: 'inbound',
        source: 'customer',
        type: message.type,
        body: message.body,
        mediaId: message.mediaId,
        waTimestamp: message.waTimestamp,
      })
      .onConflictDoNothing({ target: whatsappMessages.wamid })
      .returning({ id: whatsappMessages.id });
    return inserted?.id ?? null;
  }

  async registerInbound(
    conversationId: string,
    message: InboundMessage
  ): Promise<void> {
    const c = whatsappConversations;
    const moment = sql`${message.waTimestamp.toISOString()}::timestamptz`;
    // GREATEST ignores NULL. An old message arriving late does not overwrite the
    // preview nor move the window back.
    await this.tx
      .update(c)
      .set({
        lastMessageAt: sql`greatest(${c.lastMessageAt}, ${moment})`,
        lastMessagePreview: sql`case when ${c.lastMessageAt} is null or ${c.lastMessageAt} <= ${moment} then ${message.preview} else ${c.lastMessagePreview} end`,
        ...(message.opensWindow
          ? {
              lastInboundAt: sql`greatest(${c.lastInboundAt}, ${moment})`,
            }
          : {}),
        unreadCount: sql`${c.unreadCount} + 1`,
        status: 'open',
        updatedAt: new Date(),
      })
      .where(eq(c.id, conversationId));
  }

  async updateMessageStatus(
    change: MessageStatusChange,
    from: MessageStatus[]
  ): Promise<void> {
    if (from.length === 0) return;
    await this.tx
      .update(whatsappMessages)
      .set({
        status: change.status,
        ...(change.status === 'failed'
          ? {
              errorCode: change.errorCode,
              errorDetail: change.errorDetail,
            }
          : {}),
      })
      .where(
        and(
          eq(whatsappMessages.wamid, change.wamid),
          inArray(whatsappMessages.status, from)
        )
      );
  }
}

@Injectable()
export class DrizzleInboxUnitOfWork implements InboxUnitOfWork {
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: ApiDb) {}

  async run<T>(work: (scope: InboxTxScope) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => work(new DrizzleInboxScope(tx)));
  }
}
