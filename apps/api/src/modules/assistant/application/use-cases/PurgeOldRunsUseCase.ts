import { Inject, Injectable } from '@nestjs/common';
import { runRetentionCutoff } from '../../domain/AssistantRun';
import { ASSISTANT_TOKENS } from '../../tokens';
import type {
  PurgeOldRunsPort,
  PurgeOldRunsResult,
} from '../ports/in/PurgeOldRunsPort';
import type { AssistantRunsRepositoryPort } from '../ports/out/AssistantRunsRepositoryPort';
import type { ClockPort } from '../ports/out/ClockPort';

@Injectable()
export class PurgeOldRunsUseCase implements PurgeOldRunsPort {
  constructor(
    @Inject(ASSISTANT_TOKENS.Runs)
    private readonly runs: AssistantRunsRepositoryPort,
    @Inject(ASSISTANT_TOKENS.Clock) private readonly clock: ClockPort
  ) {}

  async execute(): Promise<PurgeOldRunsResult> {
    const deleted = await this.runs.deleteCreatedBefore(
      runRetentionCutoff(this.clock.now())
    );
    return { deleted };
  }
}
