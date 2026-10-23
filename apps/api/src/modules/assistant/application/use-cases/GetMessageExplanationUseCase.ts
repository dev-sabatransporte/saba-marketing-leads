import { Inject, Injectable } from '@nestjs/common';
import type { MessageExplanation } from '../../domain/AssistantRun';
import { MessageExplanationNotFoundException } from '../../domain/exceptions/MessageExplanationNotFoundException';
import { ASSISTANT_TOKENS } from '../../tokens';
import type { GetMessageExplanationPort } from '../ports/in/GetMessageExplanationPort';
import type { AssistantRunsRepositoryPort } from '../ports/out/AssistantRunsRepositoryPort';

@Injectable()
export class GetMessageExplanationUseCase implements GetMessageExplanationPort {
  constructor(
    @Inject(ASSISTANT_TOKENS.Runs)
    private readonly runs: AssistantRunsRepositoryPort
  ) {}

  async execute(messageId: string): Promise<MessageExplanation> {
    const explanation = await this.runs.explainSentMessage(messageId);
    if (!explanation) throw new MessageExplanationNotFoundException();
    return explanation;
  }
}
