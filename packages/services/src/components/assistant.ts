import {
  assistantDailyLimitResponseSchema,
  assistantSettingsResponseSchema,
  type TAssistantDailyLimit,
  type TAssistantSettings,
  type TUpdateAssistantSettings,
} from '@repo/schemas';
import type { Safe } from '@repo/utils';
import type { HttpClient, HttpRequestOptions } from '../http';

/** AssistantService — the WhatsApp assistant's switch and limits. */
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
}
