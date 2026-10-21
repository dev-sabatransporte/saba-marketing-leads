import { Inject } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { StructuredLogger } from '../../../../infrastructure/logging/StructuredLogger';
import { InboundMessageStored } from '../../../whatsapp/domain/events/InboundMessageStored';
import type { HandleInboundMessagePort } from '../../application/ports/in/HandleInboundMessagePort';
import { ASSISTANT_TOKENS } from '../../tokens';

@EventsHandler(InboundMessageStored)
export class AssistantInboundHandler
  implements IEventHandler<InboundMessageStored>
{
  constructor(
    @Inject(ASSISTANT_TOKENS.HandleInboundMessage)
    private readonly turn: HandleInboundMessagePort,
    private readonly logger: StructuredLogger
  ) {}

  async handle(event: InboundMessageStored): Promise<void> {
    try {
      await this.turn.execute({
        conversationId: event.conversationId,
        messageId: event.messageId,
        type: event.type,
      });
    } catch (error: unknown) {
      // Settings or runs unreachable: the customer simply gets no automatic reply.
      void this.logger.error(
        `el asistente no pudo atender el mensaje ${event.messageId}`,
        error instanceof Error ? error.stack : String(error),
        'Assistant'
      );
    }
  }
}
