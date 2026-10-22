import { Inject } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { StructuredLogger } from '../../../../infrastructure/logging/StructuredLogger';
import { InboundMessageStored } from '../../../whatsapp/domain/events/InboundMessageStored';
import type { ScheduleReplyPort } from '../../application/ports/in/ScheduleReplyPort';
import { ASSISTANT_TOKENS } from '../../tokens';

@EventsHandler(InboundMessageStored)
export class AssistantInboundHandler
  implements IEventHandler<InboundMessageStored>
{
  constructor(
    @Inject(ASSISTANT_TOKENS.ScheduleReply)
    private readonly schedule: ScheduleReplyPort,
    private readonly logger: StructuredLogger
  ) {}

  async handle(event: InboundMessageStored): Promise<void> {
    try {
      await this.schedule.execute({
        conversationId: event.conversationId,
        messageId: event.messageId,
        type: event.type,
      });
    } catch (error: unknown) {
      // Settings or the queue unreachable: the customer simply gets no automatic reply.
      void this.logger.error(
        `el asistente no pudo encolar el mensaje ${event.messageId}`,
        error instanceof Error ? error.stack : String(error),
        'Assistant'
      );
    }
  }
}
