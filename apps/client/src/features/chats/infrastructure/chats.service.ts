import type { TSendMessage } from '@repo/schemas';
import type { Safe } from '@repo/utils';
import type { Conversation, Message } from '../domain/chat.model';
import type { ChatSabaCustomers } from '../domain/sabaCustomer.model';
import type { ChatsApi } from './chats.interfaces';
import {
  toConversationDomain,
  toMessageDomain,
  toSabaCustomerDomain,
} from './chats.transform';

function data<T>(result: Safe<T>): T {
  if (!result.success) throw new Error(result.error);
  return result.data;
}

export class ChatsServiceClass {
  constructor(private chatsApi: ChatsApi) {}

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

  async pauseAssistant(conversationId: string): Promise<void> {
    data(await this.chatsApi.pauseAssistant(conversationId));
  }

  async resolve(conversationId: string): Promise<void> {
    data(await this.chatsApi.resolve(conversationId));
  }

  async sendTypingIndicator(conversationId: string): Promise<void> {
    data(await this.chatsApi.sendTypingIndicator(conversationId));
  }

  async getSabaCustomer(conversationId: string): Promise<ChatSabaCustomers> {
    return toSabaCustomerDomain(
      data(await this.chatsApi.getSabaCustomer(conversationId))
    );
  }
}
