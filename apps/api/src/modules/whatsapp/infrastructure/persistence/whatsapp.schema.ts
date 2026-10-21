import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * `saba_profile_id`, `assigned_to` and `sent_by` point to Saba's
 * `profiles.id` without an FK: the table lives in Saba's database, not in
 * this one.
 */

export const whatsappContacts = pgTable(
  'whatsapp_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Phone as digits only (E.164 without "+"). Meta does not send it if the
    // customer enabled a username: then only `user_id` arrives.
    waId: text('wa_id').unique(),
    // Meta's BSUID (`VE.…`): identifies the customer even if they do not share their phone.
    userId: text('user_id').unique(),
    profileName: text('profile_name'),
    sabaProfileId: uuid('saba_profile_id'),
    linkSource: text('link_source', { enum: ['auto', 'manual'] }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'whatsapp_contacts_identity_check',
      sql`${table.waId} IS NOT NULL OR ${table.userId} IS NOT NULL`
    ),
    check(
      'whatsapp_contacts_link_source_check',
      sql`${table.linkSource} IN ('auto', 'manual')`
    ),
  ]
);

export const whatsappConversations = pgTable(
  'whatsapp_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .unique()
      .references(() => whatsappContacts.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['open', 'resolved'] })
      .notNull()
      .default('open'),
    assignedTo: uuid('assigned_to'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    // Set when the assistant hands the chat to a person ("Necesita asesor"):
    // the assistant stays silent while it is set.
    handoffRequestedAt: timestamp('handoff_requested_at', {
      withTimezone: true,
    }),
    handoffReason: text('handoff_reason'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    // The 24 h window is computed from here: only live inbound messages move it.
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
    lastMessagePreview: text('last_message_preview'),
    unreadCount: integer('unread_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'whatsapp_conversations_status_check',
      sql`${table.status} IN ('open', 'resolved')`
    ),
    index('whatsapp_conversations_status_last_message_idx').on(
      table.status,
      table.lastMessageAt.desc()
    ),
    index('whatsapp_conversations_assigned_to_idx').on(table.assignedTo),
  ]
);

export const whatsappMessages = pgTable(
  'whatsapp_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => whatsappConversations.id, { onDelete: 'cascade' }),
    // NULL while the send is pending: Meta assigns the wamid when it accepts it.
    wamid: text('wamid').unique(),
    direction: text('direction', { enum: ['inbound', 'outbound'] }).notNull(),
    // `assistant`: written by the WhatsApp assistant (module `assistant`), `sent_by` NULL.
    source: text('source', {
      enum: ['customer', 'system', 'phone', 'history', 'assistant'],
    }).notNull(),
    // Meta type (text, image, audio, template, …): open because Meta keeps adding types.
    type: text('type').notNull(),
    // For templates, the body with the variables already replaced.
    body: text('body'),
    mediaId: text('media_id'),
    sentBy: uuid('sent_by'),
    status: text('status', {
      enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    }),
    errorCode: text('error_code'),
    errorDetail: text('error_detail'),
    templateName: text('template_name'),
    templateLanguage: text('template_language'),
    templateCategory: text('template_category'),
    waTimestamp: timestamp('wa_timestamp', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'whatsapp_messages_direction_check',
      sql`${table.direction} IN ('inbound', 'outbound')`
    ),
    check(
      'whatsapp_messages_source_check',
      sql`${table.source} IN ('customer', 'system', 'phone', 'history', 'assistant')`
    ),
    check(
      'whatsapp_messages_status_check',
      sql`${table.status} IN ('pending', 'sent', 'delivered', 'read', 'failed')`
    ),
    check(
      'whatsapp_messages_template_check',
      sql`${table.type} <> 'template' OR (${table.templateName} IS NOT NULL AND ${table.templateLanguage} IS NOT NULL)`
    ),
    index('whatsapp_messages_conversation_wa_timestamp_idx').on(
      table.conversationId,
      table.waTimestamp.desc()
    ),
  ]
);

export const whatsappWebhookEvents = pgTable(
  'whatsapp_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // No CHECK: Meta adds webhook fields and the event is saved anyway.
    field: text('field').notNull(),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
  },
  (table) => [
    index('whatsapp_webhook_events_pending_idx')
      .on(table.receivedAt)
      .where(sql`${table.processedAt} IS NULL`),
  ]
);

export const whatsappAccounts = pgTable(
  'whatsapp_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    wabaId: text('waba_id').notNull(),
    phoneNumberId: text('phone_number_id').notNull().unique(),
    displayPhone: text('display_phone'),
    status: text('status', { enum: ['connected', 'disconnected'] }).notNull(),
    disconnectReason: text('disconnect_reason'),
    historyRequestedAt: timestamp('history_requested_at', {
      withTimezone: true,
    }),
    contactsRequestedAt: timestamp('contacts_requested_at', {
      withTimezone: true,
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'whatsapp_accounts_status_check',
      sql`${table.status} IN ('connected', 'disconnected')`
    ),
  ]
);

export const whatsappContactsRelations = relations(
  whatsappContacts,
  ({ one }) => ({
    conversation: one(whatsappConversations),
  })
);

export const whatsappConversationsRelations = relations(
  whatsappConversations,
  ({ one, many }) => ({
    contact: one(whatsappContacts, {
      fields: [whatsappConversations.contactId],
      references: [whatsappContacts.id],
    }),
    messages: many(whatsappMessages),
  })
);

export const whatsappMessagesRelations = relations(
  whatsappMessages,
  ({ one }) => ({
    conversation: one(whatsappConversations, {
      fields: [whatsappMessages.conversationId],
      references: [whatsappConversations.id],
    }),
  })
);
