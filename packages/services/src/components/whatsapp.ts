import {
  chatSabaCustomersResponseSchema,
  conversationsResponseSchema,
  emptyResponseSchema,
  messageResponseSchema,
  messagesResponseSchema,
  type TAssistantSwitch,
  type TChatMessage,
  type TChatSabaCustomers,
  type TConversationSummary,
  type TSendMessage,
} from '@repo/schemas';
import type { Safe } from '@repo/utils';
import type { HttpClient, HttpRequestOptions } from '../http';

/** WhatsAppService — WhatsApp chats: conversations, messages and replies. */
export class WhatsAppService {
  private readonly basePath = '/v1/whatsapp/conversations';

  constructor(private readonly httpClient: HttpClient) {}

  async listConversations(
    options?: HttpRequestOptions
  ): Promise<Safe<TConversationSummary[]>> {
    return await this.httpClient.get(
      this.basePath,
      undefined,
      options,
      conversationsResponseSchema
    );
  }

  async listMessages(
    conversationId: string,
    options?: HttpRequestOptions
  ): Promise<Safe<TChatMessage[]>> {
    return await this.httpClient.get(
      `${this.basePath}/${encodeURIComponent(conversationId)}/messages`,
      undefined,
      options,
      messagesResponseSchema
    );
  }

  async sendMessage(
    conversationId: string,
    data: TSendMessage,
    options?: HttpRequestOptions
  ): Promise<Safe<TChatMessage>> {
    return await this.httpClient.post(
      `${this.basePath}/${encodeURIComponent(conversationId)}/messages`,
      data,
      undefined,
      options,
      messageResponseSchema
    );
  }

  async markAsRead(
    conversationId: string,
    options?: HttpRequestOptions
  ): Promise<Safe<null>> {
    return await this.httpClient.post(
      `${this.basePath}/${encodeURIComponent(conversationId)}/read`,
      undefined,
      undefined,
      options,
      emptyResponseSchema
    );
  }

  async setAssistant(
    conversationId: string,
    data: TAssistantSwitch,
    options?: HttpRequestOptions
  ): Promise<Safe<null>> {
    return await this.httpClient.put(
      `${this.basePath}/${encodeURIComponent(conversationId)}/assistant`,
      data,
      undefined,
      options,
      emptyResponseSchema
    );
  }

  async sendTypingIndicator(
    conversationId: string,
    options?: HttpRequestOptions
  ): Promise<Safe<null>> {
    return await this.httpClient.post(
      `${this.basePath}/${encodeURIComponent(conversationId)}/typing`,
      undefined,
      undefined,
      options,
      emptyResponseSchema
    );
  }

  async getSabaCustomer(
    conversationId: string,
    options?: HttpRequestOptions
  ): Promise<Safe<TChatSabaCustomers>> {
    return await this.httpClient.get(
      `${this.basePath}/${encodeURIComponent(conversationId)}/saba-customer`,
      undefined,
      options,
      chatSabaCustomersResponseSchema
    );
  }
}
