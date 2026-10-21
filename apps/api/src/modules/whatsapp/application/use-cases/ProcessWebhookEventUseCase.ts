import { Inject, Injectable } from '@nestjs/common';
import { InvalidWebhookPayloadException } from '../../domain/exceptions/InvalidWebhookPayloadException';
import type { StoredInboundMessage } from '../../domain/events/InboundMessageStored';
import { type InboxAction, statusesThatAdvanceTo } from '../../domain/Inbox';
import { parseWebhook } from '../../domain/parseWebhook';
import { WHATSAPP_TOKENS } from '../../tokens';
import type {
  ProcessingResult,
  ProcessWebhookEventPort,
} from '../ports/in/ProcessWebhookEventPort';
import type { InboundMessagePublisherPort } from '../ports/out/InboundMessagePublisherPort';
import type {
  InboxTxScope,
  InboxUnitOfWork,
} from '../ports/out/InboxUnitOfWork';
import type { WebhookEventRepositoryPort } from '../ports/out/WebhookEventRepositoryPort';

function describeError(error: unknown): string {
  if (error instanceof InvalidWebhookPayloadException) {
    return `${error.message}: ${error.detail}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Called by the event handler (right away) and by the sweep (retries): an
 * event is processed whole in one transaction and marked, so running it twice
 * duplicates nothing. Saba data is not looked up here but when the chat is
 * opened (`GetSabaCustomerUseCase`). New customer messages are announced only
 * after the commit, so listeners (the assistant) can read them.
 */
@Injectable()
export class ProcessWebhookEventUseCase implements ProcessWebhookEventPort {
  constructor(
    @Inject(WHATSAPP_TOKENS.InboxUnitOfWork)
    private readonly uow: InboxUnitOfWork,
    @Inject(WHATSAPP_TOKENS.WebhookEventRepository)
    private readonly events: WebhookEventRepositoryPort,
    @Inject(WHATSAPP_TOKENS.InboundMessagePublisher)
    private readonly inbound: InboundMessagePublisherPort
  ) {}

  async execute(eventId: string): Promise<ProcessingResult> {
    try {
      const stored: StoredInboundMessage[] = [];
      const processed = await this.uow.run(async (scope) => {
        const event = await scope.claimEvent(eventId);
        if (!event) return false;
        // In order: a payload can carry the message and then its status.
        for (const action of parseWebhook(event.field, event.payload)) {
          const message = await this.apply(scope, action);
          if (message) stored.push(message);
        }
        await scope.markProcessed(eventId);
        return true;
      });
      this.inbound.publishStored(stored);
      return processed ? 'processed' : 'skipped';
    } catch (error: unknown) {
      await this.events.registerFailure(eventId, describeError(error));
      return 'failed';
    }
  }

  /** The customer message it saved for the first time, if any. */
  private async apply(
    scope: InboxTxScope,
    action: InboxAction
  ): Promise<StoredInboundMessage | null> {
    switch (action.type) {
      case 'inboundMessage': {
        const { message } = action;
        const contactId = await scope.ensureContact(
          message.identity,
          message.profileName
        );
        const conversationId = await scope.ensureConversation(contactId);
        const messageId = await scope.insertInboundMessage(
          conversationId,
          message
        );
        if (!messageId) return null;
        await scope.registerInbound(conversationId, message);
        return { conversationId, messageId, type: message.type };
      }
      case 'statusChange':
        await scope.updateMessageStatus(
          action.change,
          statusesThatAdvanceTo(action.change.status)
        );
        return null;
    }
  }
}
