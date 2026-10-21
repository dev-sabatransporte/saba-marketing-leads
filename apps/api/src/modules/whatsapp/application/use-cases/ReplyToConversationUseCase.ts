import { Inject, Injectable } from '@nestjs/common';
import {
  type ChatMessage,
  isWindowOpen,
  MetaSendError,
} from '../../domain/Chats';
import {
  ContactWithoutPhoneException,
  ConversationNotFoundException,
  WindowClosedException,
} from '../../domain/exceptions/whatsappExceptions';
import { sendException } from '../../domain/sendException';
import { WHATSAPP_TOKENS } from '../../tokens';
import type { ReplyToConversationPort } from '../ports/in/ReplyToConversationPort';
import type {
  ChatsRepositoryPort,
  OutboundSender,
} from '../ports/out/ChatsRepositoryPort';
import type { ClockPort } from '../ports/out/ClockPort';
import type { WhatsAppCloudPort } from '../ports/out/WhatsAppCloudPort';

/**
 * The message is saved as `pending` before calling Meta: if the API dies
 * halfway, it stays visible and what the agent wrote is not lost.
 */
@Injectable()
export class ReplyToConversationUseCase implements ReplyToConversationPort {
  constructor(
    @Inject(WHATSAPP_TOKENS.ChatsRepository)
    private readonly chats: ChatsRepositoryPort,
    @Inject(WHATSAPP_TOKENS.WhatsAppCloud)
    private readonly cloud: WhatsAppCloudPort,
    @Inject(WHATSAPP_TOKENS.Clock) private readonly clock: ClockPort
  ) {}

  async execute({
    conversationId,
    body,
    sentBy,
  }: {
    conversationId: string;
    body: string;
    sentBy: string;
  }): Promise<ChatMessage> {
    return this.send(conversationId, body, { source: 'system', sentBy });
  }

  /** Same rules as a panel reply (24 h window, phone required), without a person. */
  async sendAsAssistant(
    conversationId: string,
    body: string
  ): Promise<ChatMessage> {
    return this.send(conversationId, body, {
      source: 'assistant',
      sentBy: null,
    });
  }

  private async send(
    conversationId: string,
    body: string,
    sender: OutboundSender
  ): Promise<ChatMessage> {
    const conversation = await this.chats.getConversation(conversationId);
    if (!conversation) throw new ConversationNotFoundException();

    const now = this.clock.now();
    if (!isWindowOpen(conversation.lastInboundAt, now)) {
      throw new WindowClosedException();
    }
    // Meta does not yet document how to write to a customer by username only:
    // without a phone there is no one to send it to.
    const phone = conversation.contact.waId;
    if (!phone) throw new ContactWithoutPhoneException();

    const pending = await this.chats.registerOutbound({
      ...sender,
      conversationId,
      body,
      waTimestamp: now,
    });

    try {
      const wamid = await this.cloud.sendText(phone, body);
      return await this.chats.confirmSend(pending.id, wamid);
    } catch (error: unknown) {
      if (!(error instanceof MetaSendError)) {
        await this.chats.registerSendFailure(
          pending.id,
          null,
          error instanceof Error ? error.message : String(error)
        );
        throw error;
      }
      await this.chats.registerSendFailure(
        pending.id,
        error.code === null ? null : String(error.code),
        error.detail
      );
      throw sendException(error);
    }
  }
}
