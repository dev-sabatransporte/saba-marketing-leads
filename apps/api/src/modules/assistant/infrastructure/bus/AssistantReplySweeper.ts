import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { StructuredLogger } from '../../../../infrastructure/logging/StructuredLogger';
import type { ReplyToDueChatsPort } from '../../application/ports/in/ReplyToDueChatsPort';
import { ASSISTANT_TOKENS } from '../../tokens';

// The wait is 8 s by default: answering up to 2 s late goes unnoticed, and a
// query on a table of a few rows every 2 s costs nothing.
const EVERY_MS = 2_000;

/**
 * Answers the chats whose wait is over, like the webhook reprocessor. The
 * wait lives in the database, so a restart only delays it. Several instances
 * can run it at once: each batch is claimed with FOR UPDATE SKIP LOCKED.
 */
@Injectable()
export class AssistantReplySweeper implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @Inject(ASSISTANT_TOKENS.ReplyToDueChats)
    private readonly replyToDue: ReplyToDueChatsPort,
    private readonly logger: StructuredLogger
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.pass(), EVERY_MS);
    // Does not keep the process alive (tests, shutdown).
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async pass(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.replyToDue.execute();
    } catch (error: unknown) {
      void this.logger.error(
        'falló el barrido de respuestas del asistente',
        error instanceof Error ? error.stack : String(error),
        'Assistant'
      );
    } finally {
      this.running = false;
    }
  }
}
