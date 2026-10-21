import type { AssistantSettings } from '../../../domain/AssistantSettings';

export interface AssistantSettingsRepositoryPort {
  get(): Promise<AssistantSettings>;
}
