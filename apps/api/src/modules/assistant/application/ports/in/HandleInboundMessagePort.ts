export type TurnResult = 'disabled' | 'ignored' | 'answered' | 'error';

export interface HandleInboundMessagePort {
  execute(input: {
    conversationId: string;
    messageId: string;
    type: string;
  }): Promise<TurnResult>;
}
