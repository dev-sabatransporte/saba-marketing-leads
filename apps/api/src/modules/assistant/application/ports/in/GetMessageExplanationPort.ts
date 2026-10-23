import type { MessageExplanation } from '../../../domain/AssistantRun';

export interface GetMessageExplanationPort {
  /** The "¿por qué?" of a message the assistant sent, by its WhatsApp message id. */
  execute(messageId: string): Promise<MessageExplanation>;
}
