import type { NewAssistantRun } from '../../../domain/AssistantRun';

export interface AssistantRunsRepositoryPort {
  record(run: NewAssistantRun): Promise<void>;
  /** Turns that sent the customer an answer (not a handoff notice) since `since`. */
  countReplies(filter: {
    since: Date;
    conversationId?: string;
  }): Promise<number>;
}
