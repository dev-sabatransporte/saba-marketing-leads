import type { ChatMessage } from '../../../domain/Chats';

export interface ReplyToConversationPort {
  execute(input: {
    conversationId: string;
    body: string;
    sentBy: string;
  }): Promise<ChatMessage>;
  /** Same rules, without a person behind it: source `assistant`, `sent_by` NULL. */
  sendAsAssistant(conversationId: string, body: string): Promise<ChatMessage>;
}
