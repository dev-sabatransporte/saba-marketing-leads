import { Inject, Injectable } from '@nestjs/common';
import {
  summarizeWeek,
  type WeeklySummary,
  weekWindow,
} from '../../domain/weeklySummary';
import { ASSISTANT_TOKENS } from '../../tokens';
import type { GetWeeklySummaryPort } from '../ports/in/GetWeeklySummaryPort';
import type { AssistantRunsRepositoryPort } from '../ports/out/AssistantRunsRepositoryPort';
import type { ClockPort } from '../ports/out/ClockPort';

@Injectable()
export class GetWeeklySummaryUseCase implements GetWeeklySummaryPort {
  constructor(
    @Inject(ASSISTANT_TOKENS.Runs)
    private readonly runs: AssistantRunsRepositoryPort,
    @Inject(ASSISTANT_TOKENS.Clock) private readonly clock: ClockPort
  ) {}

  async execute(): Promise<WeeklySummary> {
    const window = weekWindow(this.clock.now());
    return summarizeWeek(window, await this.runs.tally(window));
  }
}
