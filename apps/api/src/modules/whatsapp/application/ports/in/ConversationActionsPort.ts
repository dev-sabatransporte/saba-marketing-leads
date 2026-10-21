export interface ConversationActionsPort {
  /** Throws `ConversationNotFoundException`. */
  pauseAssistant(conversationId: string, pausedBy: string): Promise<void>;
  /** Throws `ConversationNotFoundException`. */
  resolve(conversationId: string): Promise<void>;
}
