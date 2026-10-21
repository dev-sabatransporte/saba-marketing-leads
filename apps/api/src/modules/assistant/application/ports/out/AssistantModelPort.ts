import type { TokenUsage } from '../../../domain/AssistantRun';
import type { ModelTurn } from '../../../domain/conversation';
import type { ModelHandoffReason } from '../../../domain/handoff';
import type { Product } from '../../../domain/product';

/**
 * The model answers the customer, hands the chat to a person, or asks for a
 * product search and waits for its result before deciding.
 */
export type ModelDecision =
  | { kind: 'answer'; text: string }
  | { kind: 'handoff'; reason: ModelHandoffReason }
  | { kind: 'search_products'; callId: string; query: string };

export type ModelReply = ModelDecision & {
  /** The model that actually answered (a fallback model after a refusal). */
  model: string;
  usage: TokenUsage;
};

/** A search the model asked for in this turn, with what Saba returned. */
export interface ProductSearch {
  callId: string;
  query: string;
  products: Product[];
}

export interface AssistantModelPort {
  /** Throws `ModelUnavailableError` when there is no usable reply. */
  reply(input: {
    instructions: string;
    turns: ModelTurn[];
    searches: ProductSearch[];
    /** Shortest possible answers: the output cap drops, so a longer one is cut and unusable. */
    simpleReplies: boolean;
  }): Promise<ModelReply>;
}
