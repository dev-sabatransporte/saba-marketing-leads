export type RunOutcome = 'answered' | 'handoff' | 'error';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** A tool the model used in a turn; `resultCount` is `null` if Saba did not answer. */
export interface ToolCall {
  tool: 'search_products';
  query: string;
  resultCount: number | null;
}

/** One assistant turn, for reviewing how it is doing and what it costs. */
export interface NewAssistantRun {
  conversationId: string;
  inboundMessageIds: string[];
  sentMessageId: string | null;
  outcome: RunOutcome;
  reason: string | null;
  errorDetail: string | null;
  model: string | null;
  usage: TokenUsage | null;
  toolCalls: ToolCall[];
  latencyMs: number;
}
