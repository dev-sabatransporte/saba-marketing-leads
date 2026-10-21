import { Inject, Injectable } from '@nestjs/common';
import type { ChatMessage } from '../../domain/Chats';
import { WHATSAPP_TOKENS } from '../../tokens';
import type {
  AssistantChannelPort,
  AssistantChat,
} from '../ports/in/AssistantChannelPort';
import type { ChatsRepositoryPort } from '../ports/out/ChatsRepositoryPort';
import { ReplyToConversationUseCase } from './ReplyToConversationUseCase';

@Injectable()
export class AssistantChannel implements AssistantChannelPort {
  constructor(
    @Inject(WHATSAPP_TOKENS.ChatsRepository)
    private readonly chats: ChatsRepositoryPort,
    private readonly reply: ReplyToConversationUseCase
  ) {}

  async read(
    conversationId: string,
    historyLimit: number
  ): Promise<AssistantChat | null> {
    const conversation = await this.chats.getConversation(conversationId);
    if (!conversation) return null;
    return {
      waId: conversation.contact.waId,
      lastInboundAt: conversation.lastInboundAt,
      messages: await this.chats.listMessages(conversationId, historyLimit),
    };
  }

  sendAsAssistant(conversationId: string, body: string): Promise<ChatMessage> {
    return this.reply.sendAsAssistant(conversationId, body);
  }
}
