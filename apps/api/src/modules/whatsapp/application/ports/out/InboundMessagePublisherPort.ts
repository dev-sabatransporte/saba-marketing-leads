import type { StoredInboundMessage } from '../../../domain/events/InboundMessageStored';

export interface InboundMessagePublisherPort {
  /** Never throws: a lost notice must not undo a message that is already saved. */
  publishStored(messages: StoredInboundMessage[]): void;
}
