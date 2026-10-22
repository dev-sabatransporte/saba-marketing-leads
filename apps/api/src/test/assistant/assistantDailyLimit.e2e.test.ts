import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BusModule } from '../../bus.module';
import { DrizzleModule } from '../../infrastructure/database/drizzle.module';
import { ErrorsModule } from '../../infrastructure/errors/ErrorsModule';
import { LoggingModule } from '../../infrastructure/logging/LoggingModule';
import {
  assistantRuns,
  assistantSettings,
} from '../../modules/assistant/infrastructure/persistence/assistant.schema';
import { AssistantModule } from '../../modules/assistant/module';
import { ASSISTANT_TOKENS } from '../../modules/assistant/tokens';
import { AuthModule } from '../../modules/auth/module';
import { AUTH_TOKENS } from '../../modules/auth/tokens';
import { WhatsAppModule } from '../../modules/whatsapp/module';
import { agent, FakeSabaAuthGateway } from '../support/fakeSabaAuth';
import {
  closeTestDb,
  getTestDb,
  resetDatabase,
  testDatabaseUrl,
} from '../support/testDatabase';

process.env.DATABASE = testDatabaseUrl();

// 11:00 in Caracas.
const NOW = new Date('2026-10-21T15:00:00Z');
let now = NOW;

describe('/assistant/daily-limit', () => {
  let app: INestApplication;

  const status = (token: string) =>
    request(app.getHttpServer())
      .get('/assistant/daily-limit')
      .set('Authorization', `Bearer ${token}`);

  async function repliesAt(count: number, at: string): Promise<void> {
    await getTestDb()
      .insert(assistantRuns)
      .values(
        Array.from({ length: count }, () => ({
          conversationId: crypto.randomUUID(),
          inboundMessageIds: [crypto.randomUUID()],
          outcome: 'answered' as const,
          latencyMs: 10,
          createdAt: new Date(at),
        }))
      );
  }

  beforeAll(async () => {
    const saba = new FakeSabaAuthGateway();
    saba.sessions.set('agent', agent({ permissions: ['marketing:access'] }));
    saba.sessions.set('outsider', agent({ permissions: [] }));

    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggingModule,
        ErrorsModule,
        DrizzleModule,
        BusModule,
        AuthModule,
        WhatsAppModule,
        AssistantModule,
      ],
    })
      .overrideProvider(AUTH_TOKENS.SabaAuthGateway)
      .useValue(saba)
      .overrideProvider(ASSISTANT_TOKENS.Clock)
      .useValue({ now: () => now })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetDatabase();
    now = NOW;
    await getTestDb()
      .insert(assistantSettings)
      .values({ enabled: true, dailyReplyLimit: 2 });
  });

  it('requires marketing:access', async () => {
    const response = await status('outsider').expect(403);
    expect(response.body.code).toBe('AUTH_PERMISSION_DENIED');
  });

  it('is not reached while there are replies left today', async () => {
    await repliesAt(1, '2026-10-21T14:00:00Z');
    // Yesterday in Caracas (23:59), even though it is the same UTC date.
    await repliesAt(1, '2026-10-21T03:59:00Z');

    const response = await status('agent').expect(200);
    expect(response.body).toEqual({ success: true, data: { reached: false } });
  });

  it('is reached once today has as many replies as the limit', async () => {
    await repliesAt(2, '2026-10-21T14:00:00Z');

    const response = await status('agent').expect(200);
    expect(response.body.data).toEqual({ reached: true });
  });

  it('clears after midnight in Venezuela', async () => {
    await repliesAt(2, '2026-10-21T14:00:00Z');
    now = new Date('2026-10-22T04:00:00Z');

    const response = await status('agent').expect(200);
    expect(response.body.data).toEqual({ reached: false });
  });

  it('is never reached while the assistant is off', async () => {
    await repliesAt(2, '2026-10-21T14:00:00Z');
    await getTestDb().update(assistantSettings).set({ enabled: false });

    const response = await status('agent').expect(200);
    expect(response.body.data).toEqual({ reached: false });
  });
});
