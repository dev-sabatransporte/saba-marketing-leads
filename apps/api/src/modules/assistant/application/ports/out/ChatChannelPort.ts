import type { ChatLine } from '../../../domain/conversation';
import type { HandoffReason } from '../../../domain/handoff';

export interface ChannelChat {
  /** `null` with a username-only contact: there is no one to send to. */
  waId: string | null;
  lastInboundAt: Date | null;
  /** Set while the chat waits for a person: the assistant stays silent. */
  handoffRequestedAt: Date | null;
  /** Someone took the chat. */
  assigned: boolean;
  /** A person wrote from the panel or the phone since the chat was (re)opened. */
  personReplied: boolean;
  /** The assistant answered since the chat was (re)opened: it introduced itself already. */
  assistantRepliedSinceOpened: boolean;
  /** A person paused the assistant in this chat until it is resolved. */
  assistantPaused: boolean;
  /** The most recent ones, in chronological order. */
  messages: ChatLine[];
}

/**
 * WhatsApp as the assistant needs it. The `whatsapp` module owns the chats
 * and fulfils this with the port it exports (`WHATSAPP_TOKENS.AssistantChannel`).
 */
export interface ChatChannelPort {
  read(
    conversationId: string,
    historyLimit: number
  ): Promise<ChannelChat | null>;
  /** Saved with source `assistant`. Throws if WhatsApp rejects it. */
  sendAsAssistant(
    conversationId: string,
    body: string
  ): Promise<{ id: string }>;
  /** Marks the chat "Necesita asesor", without assigning it to anyone. */
  requestHandoff(conversationId: string, reason: HandoffReason): Promise<void>;
  /** "Escribiendo…" while the reply is generated; never throws for Meta. */
  showTyping(conversationId: string): Promise<void>;
}
