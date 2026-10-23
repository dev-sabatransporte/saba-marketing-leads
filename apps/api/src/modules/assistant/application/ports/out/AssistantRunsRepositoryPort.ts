import type {
  MessageExplanation,
  NewAssistantRun,
} from '../../../domain/AssistantRun';
import type { RunsTally } from '../../../domain/weeklySummary';

export interface AssistantRunsRepositoryPort {
  record(run: NewAssistantRun): Promise<void>;
  /** Turns that sent the customer an answer (not a handoff notice) since `since`. */
  countReplies(filter: {
    since: Date;
    conversationId?: string;
  }): Promise<number>;
  /** From the run that sent this message; `null` if no run did. */
  explainSentMessage(messageId: string): Promise<MessageExplanation | null>;
  /** The runs created in `[from, to]`, added up for the weekly summary. */
  tally(window: { from: Date; to: Date }): Promise<RunsTally>;
  /** Returns how many were deleted. */
  deleteCreatedBefore(cutoff: Date): Promise<number>;
}
