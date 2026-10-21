import type { ChatMessage } from '../../../domain/Chats';

export interface AssistantChat {
  /** `null` with a username-only contact: there is no one to send to. */
  waId: string | null;
  lastInboundAt: Date | null;
  /** The most recent ones, in chronological order. */
  messages: ChatMessage[];
}

/**
 * The only thing the `assistant` module sees of WhatsApp: read a chat and send
 * in it as the assistant. It never touches the tables of this module.
 */
export interface AssistantChannelPort {
  /** `null` if the conversation does not exist. */
  read(
    conversationId: string,
    historyLimit: number
  ): Promise<AssistantChat | null>;
  /** Throws like a panel reply: `WindowClosedException`, `ContactWithoutPhoneException`, Meta errors. */
  sendAsAssistant(conversationId: string, body: string): Promise<ChatMessage>;
}
