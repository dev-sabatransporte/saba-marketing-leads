import type { TokenUsage } from '../../../domain/AssistantRun';
import type { ModelTurn } from '../../../domain/conversation';
import type { ModelHandoffReason } from '../../../domain/handoff';

/** The model either answers the customer or hands the chat to a person. */
export type ModelDecision =
  | { kind: 'answer'; text: string }
  | { kind: 'handoff'; reason: ModelHandoffReason };

export type ModelReply = ModelDecision & {
  /** The model that actually answered (a fallback model after a refusal). */
  model: string;
  usage: TokenUsage;
};

export interface AssistantModelPort {
  /** Throws `ModelUnavailableError` when there is no usable reply. */
  reply(input: {
    instructions: string;
    turns: ModelTurn[];
  }): Promise<ModelReply>;
}
