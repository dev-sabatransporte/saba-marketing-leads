import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BusModule } from '../../bus.module';
import { DrizzleModule } from '../../infrastructure/database/drizzle.module';
import { ErrorsModule } from '../../infrastructure/errors/ErrorsModule';
import { LoggingModule } from '../../infrastructure/logging/LoggingModule';
import { assistantRuns } from '../../modules/assistant/infrastructure/persistence/assistant.schema';
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

const NOW = new Date('2026-10-21T15:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

type NewRun = typeof assistantRuns.$inferInsert;

const NO_HANDOFFS = {
  out_of_scope: 0,
  customer_requested: 0,
  data_not_found: 0,
  non_text: 0,
  pricing: 0,
  out_of_stock: 0,
  limit_reached: 0,
  error: 0,
};

describe('/assistant/weekly-summary', () => {
  let app: INestApplication;

  const summary = (token: string) =>
    request(app.getHttpServer())
      .get('/assistant/weekly-summary')
      .set('Authorization', `Bearer ${token}`);

  async function run(
    conversationId: string,
    fields: Partial<NewRun> & Pick<NewRun, 'outcome'>,
    daysAgo = 1
  ): Promise<void> {
    await getTestDb()
      .insert(assistantRuns)
      .values({
        conversationId,
        inboundMessageIds: [crypto.randomUUID()],
        sentMessageId: crypto.randomUUID(),
        latencyMs: 10,
        createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
        ...fields,
      });
  }

  beforeAll(async () => {
    const saba = new FakeSabaAuthGateway();
    saba.sessions.set(
      'manager',
      agent({ permissions: ['marketing:access', 'assistant:manage'] })
    );
    saba.sessions.set('agent', agent({ permissions: ['marketing:access'] }));

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
      .useValue({ now: () => NOW })
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
  });

  it('requires assistant:manage', async () => {
    const response = await summary('agent').expect(403);
    expect(response.body.code).toBe('AUTH_PERMISSION_DENIED');
  });

  it('is empty without runs in the last 7 days', async () => {
    await run(crypto.randomUUID(), { outcome: 'answered' }, 8);

    const response = await summary('manager').expect(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        from: '2026-10-14T15:00:00.000Z',
        to: '2026-10-21T15:00:00.000Z',
        conversations: 0,
        resolvedWithoutPerson: 0,
        handoffsByReason: NO_HANDOFFS,
        estimatedCostUsd: 0,
        unpricedModels: [],
      },
    });
  });

  it('counts the chats it attended and the ones nobody else had to take', async () => {
    // Answered twice: resolved without a person.
    const resolved = crypto.randomUUID();
    await run(resolved, { outcome: 'answered' }, 2);
    await run(resolved, { outcome: 'answered' }, 1);
    // Answered, then handed over: a person had to step in.
    const handedOver = crypto.randomUUID();
    await run(handedOver, { outcome: 'answered' });
    await run(handedOver, { outcome: 'handoff', reason: 'pricing' });
    // A person took it while the model was answering.
    const takenOver = crypto.randomUUID();
    await run(takenOver, { outcome: 'answered' });
    await run(takenOver, {
      outcome: 'error',
      reason: 'person_took_over',
      sentMessageId: null,
    });
    // Handed over right away.
    await run(crypto.randomUUID(), { outcome: 'handoff', reason: 'pricing' });
    await run(crypto.randomUUID(), { outcome: 'handoff', reason: 'non_text' });
    // Never sent anything: not attended.
    await run(crypto.randomUUID(), {
      outcome: 'error',
      reason: 'person_took_over',
      sentMessageId: null,
    });
    // Older than the week.
    await run(crypto.randomUUID(), { outcome: 'handoff', reason: 'error' }, 8);

    const { body } = await summary('manager').expect(200);
    expect(body.data).toMatchObject({
      conversations: 5,
      resolvedWithoutPerson: 1,
      handoffsByReason: { ...NO_HANDOFFS, pricing: 2, non_text: 1 },
    });
  });

  it('estimates the cost of the week from the tokens, per model', async () => {
    const chat = crypto.randomUUID();
    // Sonnet 5.5: US$2 in, US$10 out, US$0.20 cache read, US$2.50 cache write per million.
    await run(chat, {
      outcome: 'answered',
      model: 'claude-sonnet-5-5',
      inputTokens: 600_000,
      outputTokens: 60_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 400_000,
    });
    await run(chat, {
      outcome: 'handoff',
      reason: 'out_of_scope',
      model: 'claude-sonnet-5-5',
      inputTokens: 400_000,
      outputTokens: 40_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    // A turn that failed was billed too.
    await run(crypto.randomUUID(), {
      outcome: 'error',
      reason: 'person_took_over',
      sentMessageId: null,
      model: 'claude-sonnet-5-5',
      inputTokens: 500_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    // A model without a known tariff stays out of the total, and is named.
    await run(crypto.randomUUID(), {
      outcome: 'answered',
      model: 'claude-unknown-9',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    // Outside the week.
    await run(
      crypto.randomUUID(),
      {
        outcome: 'answered',
        model: 'claude-sonnet-5-5',
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      8
    );

    const { body } = await summary('manager').expect(200);
    // 1.5 M in = 3, 0.1 M out = 1, 1 M cache read = 0.2, 0.4 M cache write = 1.
    expect(body.data.estimatedCostUsd).toBeCloseTo(5.2, 6);
    expect(body.data.unpricedModels).toEqual(['claude-unknown-9']);
  });
});
