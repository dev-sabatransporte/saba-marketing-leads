export interface StoredInboundMessage {
  conversationId: string;
  messageId: string;
  /** Meta type (`text`, `image`, `audio`, …). */
  type: string;
}

/**
 * A customer message was saved for the first time (a resent `wamid` is not
 * announced again). Published after the transaction commits, so whoever
 * listens can already read it.
 */
export class InboundMessageStored implements StoredInboundMessage {
  constructor(
    readonly conversationId: string,
    readonly messageId: string,
    readonly type: string
  ) {}
}
