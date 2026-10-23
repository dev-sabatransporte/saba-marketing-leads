import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { StructuredLogger } from '../../../../infrastructure/logging/StructuredLogger';
import type { PurgeOldRunsPort } from '../../application/ports/in/PurgeOldRunsPort';
import { RUN_RETENTION_DAYS } from '../../domain/AssistantRun';
import { ASSISTANT_TOKENS } from '../../tokens';

// Retention is counted in days: purging a few times a day is plenty, and
// several instances running it at once only delete the same rows.
const EVERY_MS = 6 * 60 * 60 * 1000;

/** Deletes the assistant runs past their retention, at startup and periodically. */
@Injectable()
export class AssistantRunsPurger
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(ASSISTANT_TOKENS.PurgeOldRuns)
    private readonly purge: PurgeOldRunsPort,
    private readonly logger: StructuredLogger
  ) {}

  onApplicationBootstrap(): void {
    // A deploy more often than every 6 h would otherwise never purge.
    void this.pass();
    this.timer = setInterval(() => void this.pass(), EVERY_MS);
    // Does not keep the process alive (tests, shutdown).
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async pass(): Promise<void> {
    try {
      const { deleted } = await this.purge.execute();
      if (deleted > 0) {
        void this.logger.log(
          `purgados ${deleted} registros del asistente con más de ${RUN_RETENTION_DAYS} días`,
          'Assistant'
        );
      }
    } catch (error: unknown) {
      void this.logger.error(
        'falló la purga de registros del asistente',
        error instanceof Error ? error.stack : String(error),
        'Assistant'
      );
    }
  }
}
