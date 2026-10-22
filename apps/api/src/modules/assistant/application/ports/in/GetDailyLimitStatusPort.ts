export interface DailyLimitStatus {
  reached: boolean;
}

export interface GetDailyLimitStatusPort {
  /** Whether the assistant is on and used up today's replies. */
  execute(): Promise<DailyLimitStatus>;
}
