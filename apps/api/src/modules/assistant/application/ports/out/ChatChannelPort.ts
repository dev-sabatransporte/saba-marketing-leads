import type { ChatLine } from '../../../domain/conversation';

export interface ChannelChat {
  /** `null` with a username-only contact: there is no one to send to. */
  waId: string | null;
  lastInboundAt: Date | null;
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
}
