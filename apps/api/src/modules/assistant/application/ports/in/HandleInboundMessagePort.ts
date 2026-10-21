export type TurnResult = 'disabled' | 'ignored' | 'answered' | 'handoff';

export interface HandleInboundMessagePort {
  execute(input: {
    conversationId: string;
    messageId: string;
    type: string;
  }): Promise<TurnResult>;
}
