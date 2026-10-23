import {
  assistantDailyLimitResponseSchema,
  assistantMessageExplanationResponseSchema,
  assistantSettingsResponseSchema,
  assistantWeeklySummaryResponseSchema,
  type TAssistantDailyLimit,
  type TAssistantMessageExplanation,
  type TAssistantSettings,
  type TAssistantWeeklySummary,
  type TUpdateAssistantSettings,
} from '@repo/schemas';
import type { Safe } from '@repo/utils';
import type { HttpClient, HttpRequestOptions } from '../http';

/** AssistantService — the WhatsApp assistant's switch, limits, weekly summary and the "¿por qué?" of its messages. */
export class AssistantService {
  private readonly basePath = '/v1/assistant';

  constructor(private readonly httpClient: HttpClient) {}

  async getSettings(
    options?: HttpRequestOptions
  ): Promise<Safe<TAssistantSettings>> {
    return await this.httpClient.get(
      `${this.basePath}/settings`,
      undefined,
      options,
      assistantSettingsResponseSchema
    );
  }

  async updateSettings(
    data: TUpdateAssistantSettings,
    options?: HttpRequestOptions
  ): Promise<Safe<TAssistantSettings>> {
    return await this.httpClient.patch(
      `${this.basePath}/settings`,
      data,
      undefined,
      options,
      assistantSettingsResponseSchema
    );
  }

  async getDailyLimit(
    options?: HttpRequestOptions
  ): Promise<Safe<TAssistantDailyLimit>> {
    return await this.httpClient.get(
      `${this.basePath}/daily-limit`,
      undefined,
      options,
      assistantDailyLimitResponseSchema
    );
  }

  async getMessageExplanation(
    messageId: string,
    options?: HttpRequestOptions
  ): Promise<Safe<TAssistantMessageExplanation>> {
    return await this.httpClient.get(
      `${this.basePath}/messages/${encodeURIComponent(messageId)}/explanation`,
      undefined,
      options,
      assistantMessageExplanationResponseSchema
    );
  }

  async getWeeklySummary(
    options?: HttpRequestOptions
  ): Promise<Safe<TAssistantWeeklySummary>> {
    return await this.httpClient.get(
      `${this.basePath}/weekly-summary`,
      undefined,
      options,
      assistantWeeklySummaryResponseSchema
    );
  }
}
