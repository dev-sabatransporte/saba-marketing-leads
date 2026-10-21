import type { TokenUsage } from '../../../domain/AssistantRun';
import type { ModelTurn } from '../../../domain/conversation';

export interface ModelReply {
  text: string;
  /** The model that actually answered (as the API reports it). */
  model: string;
  usage: TokenUsage;
}

export interface AssistantModelPort {
  /** Throws `ModelUnavailableError` when there is no usable reply. */
  reply(input: {
    instructions: string;
    turns: ModelTurn[];
  }): Promise<ModelReply>;
}
