export type ScheduleResult = 'disabled' | 'ignored' | 'scheduled';

export interface ScheduleReplyPort {
  /** A customer message arrived: it waits for the rest before the reply. */
  execute(input: {
    conversationId: string;
    messageId: string;
    type: string;
  }): Promise<ScheduleResult>;
}
