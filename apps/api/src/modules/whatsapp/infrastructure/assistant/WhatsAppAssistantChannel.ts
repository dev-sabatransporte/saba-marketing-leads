import { Inject, Injectable } from '@nestjs/common';
import type {
  AssistantChannelPort,
  AssistantChat,
} from '../../application/ports/in/AssistantChannelPort';
import type { ReplyToConversationPort } from '../../application/ports/in/ReplyToConversationPort';
import type { SendTypingIndicatorPort } from '../../application/ports/in/SendTypingIndicatorPort';
import type { ChatsRepositoryPort } from '../../application/ports/out/ChatsRepositoryPort';
import type { ClockPort } from '../../application/ports/out/ClockPort';
import type { ChatMessage } from '../../domain/Chats';
import { WHATSAPP_TOKENS } from '../../tokens';

/** The port `whatsapp` exports to the `assistant` module. */
@Injectable()
export class WhatsAppAssistantChannel implements AssistantChannelPort {
  constructor(
    @Inject(WHATSAPP_TOKENS.ChatsRepository)
    private readonly chats: ChatsRepositoryPort,
    @Inject(WHATSAPP_TOKENS.ReplyToConversation)
    private readonly reply: ReplyToConversationPort,
    @Inject(WHATSAPP_TOKENS.SendTypingIndicator)
    private readonly typing: SendTypingIndicatorPort,
    @Inject(WHATSAPP_TOKENS.Clock) private readonly clock: ClockPort
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
      handoffRequestedAt: conversation.handoffRequestedAt,
      assigned: conversation.assignedTo !== null,
      personReplied: await this.chats.personRepliedSinceOpened(conversationId),
      assistantRepliedSinceOpened:
        await this.chats.assistantRepliedSinceOpened(conversationId),
      assistantPaused: conversation.assistantPausedAt !== null,
      messages: await this.chats.listMessages(conversationId, historyLimit),
    };
  }

  sendAsAssistant(conversationId: string, body: string): Promise<ChatMessage> {
    return this.reply.sendAsAssistant(conversationId, body);
  }

  requestHandoff(conversationId: string, reason: string): Promise<void> {
    return this.chats.requestHandoff(conversationId, reason, this.clock.now());
  }

  showTyping(conversationId: string): Promise<void> {
    return this.typing.execute(conversationId);
  }
}
