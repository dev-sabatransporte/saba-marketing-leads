import { Inject, Injectable } from '@nestjs/common';
import type { AssistantSettingsWithChanges } from '../../domain/AssistantSettings';
import { ASSISTANT_TOKENS } from '../../tokens';
import type { GetAssistantSettingsPort } from '../ports/in/AssistantSettingsPort';
import type { ManagedAssistantSettingsRepositoryPort } from '../ports/out/AssistantSettingsRepositoryPort';

@Injectable()
export class GetAssistantSettingsUseCase implements GetAssistantSettingsPort {
  constructor(
    @Inject(ASSISTANT_TOKENS.Settings)
    private readonly settings: ManagedAssistantSettingsRepositoryPort
  ) {}

  execute(): Promise<AssistantSettingsWithChanges> {
    return this.settings.getWithChanges();
  }
}
