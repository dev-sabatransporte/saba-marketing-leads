import type {
  MessageExplanation,
  NewAssistantRun,
} from '../../../domain/AssistantRun';

export interface AssistantRunsRepositoryPort {
  record(run: NewAssistantRun): Promise<void>;
  /** Turns that sent the customer an answer (not a handoff notice) since `since`. */
  countReplies(filter: {
    since: Date;
    conversationId?: string;
  }): Promise<number>;
  /** From the run that sent this message; `null` if no run did. */
  explainSentMessage(messageId: string): Promise<MessageExplanation | null>;
}
