export interface DailyLimitStatusPort {
  /** Whether the assistant is on and used up today's replies. */
  execute(): Promise<{ reached: boolean }>;
}
