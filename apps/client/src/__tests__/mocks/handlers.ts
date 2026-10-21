/**
 * MSW handler aggregator.
 *
 * All of the panel's data consumption happens in the browser against the
 * NestJS API, so intercepting HTTP with MSW is the natural way to test it: the
 * tests exercise the same path as production, without doubling the HTTP
 * client.
 *
 * A specific handler is overridden in the test with `server.use(...)`.
 */

import { assistantSettingsHandlers } from './handlers/assistantSettings.mock';
import { chatsHandlers } from './handlers/chats.mock';
import { healthHandlers } from './handlers/health.mock';
import { leadsHandlers } from './handlers/leads.mock';
import { sessionHandlers } from './handlers/session.mock';

export const handlers = [
  ...assistantSettingsHandlers,
  ...chatsHandlers,
  ...healthHandlers,
  ...leadsHandlers,
  ...sessionHandlers,
];
