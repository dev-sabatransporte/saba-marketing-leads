import { Inject, Injectable } from '@nestjs/common';
import {
  type ApiDb,
  DRIZZLE_CLIENT,
} from '../../../../infrastructure/database/drizzle.module';
import type { AssistantSettingsRepositoryPort } from '../../application/ports/out/AssistantSettingsRepositoryPort';
import {
  type AssistantSettings,
  DEFAULT_ASSISTANT_SETTINGS,
} from '../../domain/AssistantSettings';

@Injectable()
export class DrizzleAssistantSettingsRepository
  implements AssistantSettingsRepositoryPort
{
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: ApiDb) {}

  async get(): Promise<AssistantSettings> {
    const row = await this.db.query.assistantSettings.findFirst({
      columns: {
        enabled: true,
        perContactDailyLimit: true,
        debounceSeconds: true,
        maxWaitSeconds: true,
        dailyReplyLimit: true,
      },
    });
    return row ?? DEFAULT_ASSISTANT_SETTINGS;
  }
}
