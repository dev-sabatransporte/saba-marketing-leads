import { assistantMessages } from '../../modules/assistant/infrastructure/i18n/messages';
import { authMessages } from '../../modules/auth/infrastructure/i18n/messages';
import { leadsMessages } from '../../modules/leads/infrastructure/i18n/messages';
import { sabaCustomersMessages } from '../../modules/sabaCustomers/infrastructure/i18n/messages';
import { whatsappMessages } from '../../modules/whatsapp/infrastructure/i18n/messages';

/**
 * Single catalog of domain messages, in Spanish. A new module adds its code
 * catalog in its own `infrastructure/i18n/messages.ts` and adds it here in the
 * same PR as its exceptions, together with its HTTP status in
 * `DomainToHttpMapper`.
 */
export type DomainErrorCode =
  | keyof typeof assistantMessages
  | keyof typeof authMessages
  | keyof typeof leadsMessages
  | keyof typeof sabaCustomersMessages
  | keyof typeof whatsappMessages;

export const domainMessages: Record<DomainErrorCode, string> = {
  ...assistantMessages,
  ...authMessages,
  ...leadsMessages,
  ...sabaCustomersMessages,
  ...whatsappMessages,
};

export function resolveDomainMessage(code: string): string | undefined {
  return (domainMessages as Record<string, string>)[code];
}
