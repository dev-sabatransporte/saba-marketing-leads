export interface ReplyToDueChatsPort {
  /** Runs a turn for each chat whose wait is over; returns how many. */
  execute(): Promise<number>;
}
