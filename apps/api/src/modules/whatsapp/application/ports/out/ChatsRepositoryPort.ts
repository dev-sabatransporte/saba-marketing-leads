import type { ChatMessage, ConversationSummary } from '../../../domain/Chats';

/** Who writes: a person from the panel, or the assistant (no person behind it). */
export type OutboundSender =
  | { source: 'system'; sentBy: string }
  | { source: 'assistant'; sentBy: null };

export type NewOutboundMessage = OutboundSender & {
  conversationId: string;
  body: string;
  waTimestamp: Date;
};

export interface ChatsRepositoryPort {
  listConversations(limit: number): Promise<ConversationSummary[]>;
  getConversation(id: string): Promise<ConversationSummary | null>;
  /** The most recent ones, returned in chronological order. */
  listMessages(conversationId: string, limit: number): Promise<ChatMessage[]>;
  /** Inserts the message as `pending` and makes it the conversation's last one. */
  registerOutbound(message: NewOutboundMessage): Promise<ChatMessage>;
  confirmSend(messageId: string, wamid: string): Promise<ChatMessage>;
  registerSendFailure(
    messageId: string,
    code: string | null,
    detail: string
  ): Promise<void>;
  markAsRead(conversationId: string): Promise<boolean>;
  /** `false` if the conversation does not exist. */
  pauseAssistant(
    conversationId: string,
    pausedBy: string,
    at: Date
  ): Promise<boolean>;
  /** `false` if the conversation does not exist. */
  resolve(conversationId: string, at: Date): Promise<boolean>;
  /** A message from the panel or the phone since the chat was (re)opened. */
  personRepliedSinceOpened(conversationId: string): Promise<boolean>;
  /** Marks the chat "Necesita asesor"; no-op if it already is. */
  requestHandoff(
    conversationId: string,
    reason: string,
    at: Date
  ): Promise<void>;
  /** `wamid` of the last message the customer sent; `null` if they never wrote. */
  lastInboundWamid(conversationId: string): Promise<string | null>;
  /** `undefined` if the message does not exist; `null` if it exists but has no file. */
  mediaIdOf(messageId: string): Promise<string | null | undefined>;
}
