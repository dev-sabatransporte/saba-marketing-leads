import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { StructuredLogger } from '../../../../infrastructure/logging/StructuredLogger';
import type { InboundMessagePublisherPort } from '../../application/ports/out/InboundMessagePublisherPort';
import {
  InboundMessageStored,
  type StoredInboundMessage,
} from '../../domain/events/InboundMessageStored';

@Injectable()
export class CqrsInboundMessagePublisher implements InboundMessagePublisherPort {
  constructor(
    private readonly eventBus: EventBus,
    private readonly logger: StructuredLogger
  ) {}

  publishStored(messages: StoredInboundMessage[]): void {
    if (!messages.length) return;
    try {
      this.eventBus.publishAll(
        messages.map(
          (m) => new InboundMessageStored(m.conversationId, m.messageId, m.type)
        )
      );
    } catch (error: unknown) {
      void this.logger.error(
        'no se pudo publicar InboundMessageStored',
        error instanceof Error ? error.stack : String(error),
        'WhatsAppWebhook'
      );
    }
  }
}
