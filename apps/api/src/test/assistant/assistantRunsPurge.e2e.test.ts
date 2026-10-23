import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BusModule } from '../../bus.module';
import { DrizzleModule } from '../../infrastructure/database/drizzle.module';
import { LoggingModule } from '../../infrastructure/logging/LoggingModule';
import type { PurgeOldRunsPort } from '../../modules/assistant/application/ports/in/PurgeOldRunsPort';
import { assistantRuns } from '../../modules/assistant/infrastructure/persistence/assistant.schema';
import { AssistantModule } from '../../modules/assistant/module';
import { ASSISTANT_TOKENS } from '../../modules/assistant/tokens';
import { AuthModule } from '../../modules/auth/module';
import { WhatsAppModule } from '../../modules/whatsapp/module';
import {
  closeTestDb,
  getTestDb,
  resetDatabase,
  testDatabaseUrl,
} from '../support/testDatabase';

process.env.DATABASE = testDatabaseUrl();

const NOW = new Date('2026-10-21T15:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('purge of old assistant runs', () => {
  let app: INestApplication;
  let purge: PurgeOldRunsPort;

  async function runDaysAgo(days: number): Promise<string> {
    const [row] = await getTestDb()
      .insert(assistantRuns)
      .values({
        conversationId: crypto.randomUUID(),
        inboundMessageIds: [crypto.randomUUID()],
        outcome: 'answered',
        latencyMs: 10,
        createdAt: new Date(NOW.getTime() - days * DAY_MS),
      })
      .returning({ id: assistantRuns.id });
    if (!row) throw new Error('run not inserted');
    return row.id;
  }

  let staleAtStartup = '';
  let purgedAtStartup: string[] = [];

  beforeAll(async () => {
    await resetDatabase();
    const stale = await runDaysAgo(120);
    staleAtStartup = stale;
    const kept = await runDaysAgo(5);

    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggingModule,
        DrizzleModule,
        BusModule,
        AuthModule,
        WhatsAppModule,
        AssistantModule,
      ],
    })
      .overrideProvider(ASSISTANT_TOKENS.Clock)
      .useValue({ now: () => NOW })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    purge = app.get(ASSISTANT_TOKENS.PurgeOldRuns);

    const left = await getTestDb()
      .select({ id: assistantRuns.id })
      .from(assistantRuns);
    purgedAtStartup = [stale, kept].filter(
      (id) => !left.some((row) => row.id === id)
    );
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('purges once the API has started, without waiting for the interval', () => {
    expect(purgedAtStartup).toEqual([staleAtStartup]);
  });

  it('deletes the runs older than 90 days and keeps the rest', async () => {
    await runDaysAgo(91);
    await runDaysAgo(200);
    const edge = await runDaysAgo(90);
    const recent = await runDaysAgo(1);

    expect(await purge.execute()).toEqual({ deleted: 2 });

    const left = await getTestDb()
      .select({ id: assistantRuns.id })
      .from(assistantRuns);
    expect(left.map((row) => row.id).sort()).toEqual([edge, recent].sort());
  });

  it('deletes nothing when every run is recent', async () => {
    await runDaysAgo(3);

    expect(await purge.execute()).toEqual({ deleted: 0 });
  });
});
