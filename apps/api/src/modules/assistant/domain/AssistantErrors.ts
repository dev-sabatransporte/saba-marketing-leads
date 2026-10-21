/** The model did not give a usable reply: not configured, API error, refusal or empty text. */
export class ModelUnavailableError extends Error {
  constructor(
    readonly reason: 'not_configured' | 'api_error' | 'refusal' | 'empty',
    detail: string
  ) {
    super(detail);
  }
}
