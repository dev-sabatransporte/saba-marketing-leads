import type { TSendMessage } from '@repo/schemas';
import type { Safe } from '@repo/utils';
import type { Conversation, Message } from '../domain/chat.model';
import type { MessageExplanation } from '../domain/messageExplanation.model';
import type { ChatSabaCustomers } from '../domain/sabaCustomer.model';
import type { AssistantStatusApi, ChatsApi } from './chats.interfaces';
import {
  toConversationDomain,
  toMessageDomain,
  toMessageExplanationDomain,
  toSabaCustomerDomain,
} from './chats.transform';

function data<T>(result: Safe<T>): T {
  if (!result.success) throw new Error(result.error);
  return result.data;
}

export class ChatsServiceClass {
  constructor(
    private chatsApi: ChatsApi,
    private assistantApi: AssistantStatusApi
  ) {}

  async listConversations(): Promise<Conversation[]> {
    return data(await this.chatsApi.listConversations()).map(
      toConversationDomain
    );
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    return data(await this.chatsApi.listMessages(conversationId)).map(
      toMessageDomain
    );
  }

  async sendMessage(
    conversationId: string,
    message: TSendMessage
  ): Promise<Message> {
    return toMessageDomain(
      data(await this.chatsApi.sendMessage(conversationId, message))
    );
  }

  async markAsRead(conversationId: string): Promise<void> {
    data(await this.chatsApi.markAsRead(conversationId));
  }

  async setAssistant(conversationId: string, enabled: boolean): Promise<void> {
    data(await this.chatsApi.setAssistant(conversationId, { enabled }));
  }

  async sendTypingIndicator(conversationId: string): Promise<void> {
    data(await this.chatsApi.sendTypingIndicator(conversationId));
  }

  async getSabaCustomer(conversationId: string): Promise<ChatSabaCustomers> {
    return toSabaCustomerDomain(
      data(await this.chatsApi.getSabaCustomer(conversationId))
    );
  }

  /** Whether the assistant stopped answering for today. */
  async isDailyLimitReached(): Promise<boolean> {
    return data(await this.assistantApi.getDailyLimit()).reached;
  }

  async explainMessage(messageId: string): Promise<MessageExplanation> {
    return toMessageExplanationDomain(
      data(await this.assistantApi.getMessageExplanation(messageId))
    );
  }
}
