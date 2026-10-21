import type { TokenUsage } from './AssistantRun';

/** The model did not give a usable reply: not configured, API error, refusal, empty text or a malformed tool call. */
export class ModelUnavailableError extends Error {
  constructor(
    readonly reason:
      | 'not_configured'
      | 'api_error'
      | 'refusal'
      | 'empty'
      | 'invalid_tool_input',
    detail: string,
    /** Set when Anthropic answered (and billed) but the reply was unusable. */
    readonly billed: { model: string; usage: TokenUsage } | null = null
  ) {
    super(detail);
  }
}
