import { HttpStatus } from '@nestjs/common';
import type { DomainErrorCode } from '../i18n/domainMessages';

/**
 * HTTP status per domain code. The `Record<DomainErrorCode, ...>` type makes a
 * new code in `domainMessages` without its entry here a `tsc` error, not a
 * masked 500 discovered in production.
 */
export const domainErrorHttpStatus: Record<DomainErrorCode, HttpStatus> = {
  ASSISTANT_MAX_WAIT_BELOW_DEBOUNCE: HttpStatus.BAD_REQUEST,
  AUTH_INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  AUTH_INVALID_CAPTCHA: HttpStatus.BAD_REQUEST,
  AUTH_TOO_MANY_ATTEMPTS: HttpStatus.TOO_MANY_REQUESTS,
  AUTH_ACCOUNT_LOCKED: HttpStatus.LOCKED,
  AUTH_NO_ACCESS: HttpStatus.FORBIDDEN,
  AUTH_INVALID_SESSION: HttpStatus.UNAUTHORIZED,
  AUTH_PERMISSION_DENIED: HttpStatus.FORBIDDEN,
  // 424 and not 5xx (published as INTERNAL_ERROR) nor 401 (the BFF would log
  // the agent out): the session may be fine, it is Saba that did not answer.
  AUTH_UNAVAILABLE: HttpStatus.FAILED_DEPENDENCY,
  LEADS_DUPLICATE_EMAIL: HttpStatus.CONFLICT,
  // 424 and not 5xx: the panel has to be able to say the problem is Saba.
  SABA_CUSTOMERS_UNAVAILABLE: HttpStatus.FAILED_DEPENDENCY,
  SABA_CUSTOMERS_FORBIDDEN: HttpStatus.FORBIDDEN,
  // Not 401: the panel's BFF would take it as an expired session and log the marketing user out.
  SABA_CUSTOMERS_SESSION_NOT_RECOGNIZED: HttpStatus.FAILED_DEPENDENCY,
  WHATSAPP_INVALID_WEBHOOK_SIGNATURE: HttpStatus.UNAUTHORIZED,
  WHATSAPP_CONVERSATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  WHATSAPP_WINDOW_CLOSED: HttpStatus.CONFLICT,
  WHATSAPP_MEDIA_UNAVAILABLE: HttpStatus.NOT_FOUND,
  WHATSAPP_CONTACT_WITHOUT_PHONE: HttpStatus.UNPROCESSABLE_ENTITY,
  WHATSAPP_RECIPIENT_NOT_ALLOWED: HttpStatus.UNPROCESSABLE_ENTITY,
  WHATSAPP_UNDELIVERABLE: HttpStatus.UNPROCESSABLE_ENTITY,
  WHATSAPP_TOO_MANY_SENDS: HttpStatus.TOO_MANY_REQUESTS,
  // 424 and not 5xx: a 5xx is published as INTERNAL_ERROR and the agent needs to
  // know the problem is in Meta or in the configuration, not in the panel.
  WHATSAPP_NOT_CONFIGURED: HttpStatus.FAILED_DEPENDENCY,
  WHATSAPP_INVALID_TOKEN: HttpStatus.FAILED_DEPENDENCY,
  WHATSAPP_SEND_REJECTED: HttpStatus.FAILED_DEPENDENCY,
  WHATSAPP_INVALID_WEBHOOK_PAYLOAD: HttpStatus.UNPROCESSABLE_ENTITY,
  WHATSAPP_WEBHOOK_SUBSCRIPTION_REJECTED: HttpStatus.FORBIDDEN,
};

export function mapDomainErrorToHttpStatus(code: string): HttpStatus {
  return (
    (domainErrorHttpStatus as Record<string, HttpStatus>)[code] ??
    HttpStatus.INTERNAL_SERVER_ERROR
  );
}
