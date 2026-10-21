export interface ConversationActionsPort {
  /**
   * Turns the assistant on or off in one chat. Throws
   * `ConversationNotFoundException`.
   */
  setAssistantEnabled(
    conversationId: string,
    enabled: boolean,
    by: string
  ): Promise<void>;
}
