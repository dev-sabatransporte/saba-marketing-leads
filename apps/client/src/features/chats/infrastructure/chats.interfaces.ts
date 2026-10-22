import type {
  TAssistantDailyLimit,
  TAssistantSwitch,
  TChatMessage,
  TChatSabaCustomers,
  TConversationSummary,
  TSendMessage,
} from '@repo/schemas';
import type { Safe } from '@repo/utils';

/** Port: the only thing this feature needs from the API. */
export interface ChatsApi {
  listConversations(): Promise<Safe<TConversationSummary[]>>;
  listMessages(conversationId: string): Promise<Safe<TChatMessage[]>>;
  sendMessage(
    conversationId: string,
    data: TSendMessage
  ): Promise<Safe<TChatMessage>>;
  markAsRead(conversationId: string): Promise<Safe<null>>;
  setAssistant(
    conversationId: string,
    data: TAssistantSwitch
  ): Promise<Safe<null>>;
  sendTypingIndicator(conversationId: string): Promise<Safe<null>>;
  getSabaCustomer(conversationId: string): Promise<Safe<TChatSabaCustomers>>;
}

/** Port: what the chats need from the assistant, to warn the team. */
export interface AssistantStatusApi {
  getDailyLimit(): Promise<Safe<TAssistantDailyLimit>>;
}
