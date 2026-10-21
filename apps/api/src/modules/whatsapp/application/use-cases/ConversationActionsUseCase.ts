import { Inject, Injectable } from '@nestjs/common';
import { ConversationNotFoundException } from '../../domain/exceptions/whatsappExceptions';
import { WHATSAPP_TOKENS } from '../../tokens';
import type { ConversationActionsPort } from '../ports/in/ConversationActionsPort';
import type { ChatsRepositoryPort } from '../ports/out/ChatsRepositoryPort';
import type { ClockPort } from '../ports/out/ClockPort';

@Injectable()
export class ConversationActionsUseCase implements ConversationActionsPort {
  constructor(
    @Inject(WHATSAPP_TOKENS.ChatsRepository)
    private readonly chats: ChatsRepositoryPort,
    @Inject(WHATSAPP_TOKENS.Clock) private readonly clock: ClockPort
  ) {}

  async pauseAssistant(
    conversationId: string,
    pausedBy: string
  ): Promise<void> {
    if (
      !(await this.chats.pauseAssistant(
        conversationId,
        pausedBy,
        this.clock.now()
      ))
    ) {
      throw new ConversationNotFoundException();
    }
  }

  async resolve(conversationId: string): Promise<void> {
    if (!(await this.chats.resolve(conversationId, this.clock.now()))) {
      throw new ConversationNotFoundException();
    }
  }
}
