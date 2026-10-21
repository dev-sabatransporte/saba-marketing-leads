import type {
  ContactIdentity,
  InboundMessage,
  MessageStatus,
  MessageStatusChange,
} from '../../../domain/Inbox';

export interface PendingWebhookEvent {
  id: string;
  field: string;
  payload: unknown;
}

/** Operations bound to a single transaction: all or nothing per event. */
export interface InboxTxScope {
  /** Locks the event if it is still unprocessed; `null` if it was already processed or another instance has it. */
  claimEvent(eventId: string): Promise<PendingWebhookEvent | null>;
  markProcessed(eventId: string): Promise<void>;
  /** Looks up by `user_id` or by phone, fills in whatever is missing and returns the id. */
  ensureContact(
    identity: ContactIdentity,
    profileName: string | null
  ): Promise<string>;
  ensureConversation(contactId: string): Promise<string>;
  /** The new message id; `null` if the `wamid` already existed (Meta resends webhooks). */
  insertInboundMessage(
    conversationId: string,
    message: InboundMessage
  ): Promise<string | null>;
  registerInbound(
    conversationId: string,
    message: InboundMessage
  ): Promise<void>;
  /** Only changes the messages that are in one of `from`. */
  updateMessageStatus(
    change: MessageStatusChange,
    from: MessageStatus[]
  ): Promise<void>;
}

export interface InboxUnitOfWork {
  run<T>(work: (scope: InboxTxScope) => Promise<T>): Promise<T>;
}
