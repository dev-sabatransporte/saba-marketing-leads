import type { TokenUsage } from './AssistantRun';

/** The model did not give a usable reply: not configured, API error, refusal, cut off at the output cap, empty text or a malformed tool call. */
export class ModelUnavailableError extends Error {
  constructor(
    readonly reason:
      | 'not_configured'
      | 'api_error'
      | 'refusal'
      | 'truncated'
      | 'empty'
      | 'invalid_tool_input',
    detail: string,
    /** Set when Anthropic answered (and billed) but the reply was unusable. */
    readonly billed: { model: string; usage: TokenUsage } | null = null
  ) {
    super(detail);
  }
}

/** Saba did not answer a product search: down, slow, rate-limited or the key rejected. */
export class CatalogUnavailableError extends Error {
  constructor(
    /** The assistant key is missing or rejected: a person must fix it, retrying will not. */
    readonly misconfigured: boolean,
    detail: string
  ) {
    super(detail);
  }
}
