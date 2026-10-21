import type { NewAssistantRun } from '../../../domain/AssistantRun';

export interface AssistantRunsRepositoryPort {
  record(run: NewAssistantRun): Promise<void>;
}
