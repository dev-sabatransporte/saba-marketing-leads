import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { assistantMessageExplanationResponseSchema } from '@repo/schemas';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BusModule } from '../../bus.module';
import { DrizzleModule } from '../../infrastructure/database/drizzle.module';
import { ErrorsModule } from '../../infrastructure/errors/ErrorsModule';
import { LoggingModule } from '../../infrastructure/logging/LoggingModule';
import { assistantRuns } from '../../modules/assistant/infrastructure/persistence/assistant.schema';
import { AssistantModule } from '../../modules/assistant/module';
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

describe('/assistant/messages/:id/explanation', () => {
  let app: INestApplication;

  const explanation = (messageId: string, token = 'agent') =>
    request(app.getHttpServer())
      .get(`/assistant/messages/${messageId}/explanation`)
      .set('Authorization', `Bearer ${token}`);

  async function run(
    fields: Partial<typeof assistantRuns.$inferInsert>
  ): Promise<void> {
    await getTestDb()
      .insert(assistantRuns)
      .values({
        conversationId: crypto.randomUUID(),
        inboundMessageIds: [crypto.randomUUID()],
        outcome: 'answered',
        latencyMs: 10,
        ...fields,
      });
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

  it('requires marketing:access', async () => {
    const response = await explanation(crypto.randomUUID(), 'outsider').expect(
      403
    );
    expect(response.body.code).toBe('AUTH_PERMISSION_DENIED');
  });

  it('shows what it searched and found for an answer', async () => {
    const messageId = crypto.randomUUID();
    await run({
      sentMessageId: messageId,
      outcome: 'answered',
      model: 'claude-sonnet-5-5',
      inputTokens: 1200,
      toolCalls: [
        { tool: 'search_products', query: 'moto electrica', resultCount: 3 },
      ],
    });

    const response = await explanation(messageId).expect(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        outcome: 'answered',
        handoffReason: null,
        toolCalls: [
          { tool: 'search_products', query: 'moto electrica', resultCount: 3 },
        ],
      },
    });
    expect(
      assistantMessageExplanationResponseSchema.safeParse(response.body).success
    ).toBe(true);
  });

  it('shows the reason of a handoff, without the technical detail', async () => {
    const messageId = crypto.randomUUID();
    await run({
      sentMessageId: messageId,
      outcome: 'handoff',
      reason: 'error',
      errorDetail: 'search_products: Saba respondió 503',
      toolCalls: [
        { tool: 'search_products', query: 'SBR 150', resultCount: null },
      ],
    });

    const response = await explanation(messageId).expect(200);
    expect(response.body.data).toEqual({
      outcome: 'handoff',
      handoffReason: 'error',
      toolCalls: [
        { tool: 'search_products', query: 'SBR 150', resultCount: null },
      ],
    });
    expect(JSON.stringify(response.body)).not.toContain('503');
  });

  it('is not found for a message the assistant did not send', async () => {
    await run({ sentMessageId: crypto.randomUUID() });

    const response = await explanation(crypto.randomUUID()).expect(404);
    expect(response.body.code).toBe('ASSISTANT_MESSAGE_EXPLANATION_NOT_FOUND');
  });

  it('rejects an id that is not a uuid', async () => {
    await explanation('not-a-uuid').expect(400);
  });
});
