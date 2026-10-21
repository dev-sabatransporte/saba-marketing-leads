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

  async setAssistantEnabled(
    conversationId: string,
    enabled: boolean,
    by: string
  ): Promise<void> {
    const now = this.clock.now();
    const found = enabled
      ? await this.chats.turnAssistantOn(conversationId, now)
      : await this.chats.turnAssistantOff(conversationId, by, now);
    if (!found) throw new ConversationNotFoundException();
  }
}
