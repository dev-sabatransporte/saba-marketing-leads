import { Inject, Injectable } from '@nestjs/common';
import { startOfVenezuelanDay } from '../../domain/replyLimits';
import { ASSISTANT_TOKENS } from '../../tokens';
import type { DailyLimitStatusPort } from '../ports/in/DailyLimitStatusPort';
import type { AssistantRunsRepositoryPort } from '../ports/out/AssistantRunsRepositoryPort';
import type { AssistantSettingsRepositoryPort } from '../ports/out/AssistantSettingsRepositoryPort';
import type { ClockPort } from '../ports/out/ClockPort';

/**
 * For the panel's notice: the same count the turn checks, so the notice shows
 * exactly while the assistant stays silent for the day's limit.
 */
@Injectable()
export class GetDailyLimitStatusUseCase implements DailyLimitStatusPort {
  constructor(
    @Inject(ASSISTANT_TOKENS.Settings)
    private readonly settings: AssistantSettingsRepositoryPort,
    @Inject(ASSISTANT_TOKENS.Runs)
    private readonly runs: AssistantRunsRepositoryPort,
    @Inject(ASSISTANT_TOKENS.Clock) private readonly clock: ClockPort
  ) {}

  async execute(): Promise<{ reached: boolean }> {
    const { enabled, dailyReplyLimit } = await this.settings.get();
    // Off, it answers nobody anyway: "se reanuda mañana" would be wrong.
    if (!enabled) return { reached: false };
    const repliesToday = await this.runs.countReplies({
      since: startOfVenezuelanDay(this.clock.now()),
    });
    return { reached: repliesToday >= dailyReplyLimit };
  }
}
