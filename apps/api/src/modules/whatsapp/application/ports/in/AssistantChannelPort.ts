import type { ChatMessage } from '../../../domain/Chats';

export interface AssistantChat {
  /** `null` with a username-only contact: there is no one to send to. */
  waId: string | null;
  lastInboundAt: Date | null;
  /** Set while the chat waits for a person: the assistant stays silent. */
  handoffRequestedAt: Date | null;
  /** Someone took the chat. */
  assigned: boolean;
  /** A person wrote from the panel or the phone since the chat was (re)opened. */
  personReplied: boolean;
  /** A person paused the assistant in this chat. */
  assistantPaused: boolean;
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
  /** Marks the chat "Necesita asesor", without assigning it to anyone. */
  requestHandoff(conversationId: string, reason: string): Promise<void>;
}
