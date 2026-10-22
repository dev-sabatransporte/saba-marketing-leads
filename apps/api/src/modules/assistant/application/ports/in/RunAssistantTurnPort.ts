export type TurnResult =
  | 'disabled'
  | 'ignored'
  | 'daily_limit'
  | 'answered'
  | 'handoff';

export interface RunAssistantTurnPort {
  /** Answers the customer messages of a batch, once their wait is over. */
  execute(input: {
    conversationId: string;
    messageIds: string[];
  }): Promise<TurnResult>;
}
