import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BusModule } from '../../bus.module';
import { DrizzleModule } from '../../infrastructure/database/drizzle.module';
import { ErrorsModule } from '../../infrastructure/errors/ErrorsModule';
import { LoggingModule } from '../../infrastructure/logging/LoggingModule';
import type { AssistantSettingsRepositoryPort } from '../../modules/assistant/application/ports/out/AssistantSettingsRepositoryPort';
import { AssistantModule } from '../../modules/assistant/module';
import { ASSISTANT_TOKENS } from '../../modules/assistant/tokens';
import { AuthModule } from '../../modules/auth/module';
import { AUTH_TOKENS } from '../../modules/auth/tokens';
import { WhatsAppModule } from '../../modules/whatsapp/module';
import { ZodValidationPipe } from '../../shared/pipes/zodValidationPipe';
import { agent, FakeSabaAuthGateway } from '../support/fakeSabaAuth';
import {
  closeTestDb,
  resetDatabase,
  testDatabaseUrl,
} from '../support/testDatabase';

process.env.DATABASE = testDatabaseUrl();

const NOW = new Date('2026-10-21T15:00:00Z');
let now = NOW;

const MANAGER = agent({
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Gerente',
  permissions: ['marketing:access', 'assistant:manage'],
});
const OTHER_MANAGER = agent({
  id: '33333333-3333-3333-3333-333333333333',
  name: 'Otra Gerente',
  permissions: ['marketing:access', 'assistant:manage'],
});
const AGENT = agent({ permissions: ['marketing:access'] });

const NO_CHANGES = {
  enabled: null,
  simpleReplies: null,
  perContactDailyLimit: null,
  debounceSeconds: null,
  maxWaitSeconds: null,
  dailyReplyLimit: null,
};

describe('/assistant/settings', () => {
  let app: INestApplication;
  let saba: FakeSabaAuthGateway;

  const get = (token: string) =>
    request(app.getHttpServer())
      .get('/assistant/settings')
      .set('Authorization', `Bearer ${token}`);
  const patch = (token: string, body: unknown) =>
    request(app.getHttpServer())
      .patch('/assistant/settings')
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);

  beforeAll(async () => {
    saba = new FakeSabaAuthGateway();
    saba.sessions.set('manager', MANAGER);
    saba.sessions.set('other-manager', OTHER_MANAGER);
    saba.sessions.set('agent', AGENT);

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
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetDatabase();
    now = NOW;
  });

  it('rejects reading and changing the settings without assistant:manage', async () => {
    const read = await get('agent').expect(403);
    expect(read.body.code).toBe('AUTH_PERMISSION_DENIED');

    const change = await patch('agent', { enabled: true }).expect(403);
    expect(change.body.code).toBe('AUTH_PERMISSION_DENIED');

    const unchanged = await get('manager').expect(200);
    expect(unchanged.body.data.enabled).toBe(false);
  });

  it('starts off with the default limits and no changes recorded', async () => {
    const response = await get('manager').expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        enabled: false,
        simpleReplies: true,
        perContactDailyLimit: 20,
        debounceSeconds: 8,
        maxWaitSeconds: 30,
        dailyReplyLimit: 300,
        changes: NO_CHANGES,
      },
    });
  });

  it('turns the assistant on, recording who and when', async () => {
    const response = await patch('manager', { enabled: true }).expect(200);

    expect(response.body.data).toMatchObject({
      enabled: true,
      changes: {
        ...NO_CHANGES,
        enabled: {
          changedBy: { id: MANAGER.id, name: 'Gerente' },
          changedAt: NOW.toISOString(),
        },
      },
    });
    expect((await get('manager')).body.data).toEqual(response.body.data);
  });

  it('records each setting with whoever last changed it', async () => {
    await patch('manager', { enabled: true, dailyReplyLimit: 200 }).expect(200);

    now = new Date(NOW.getTime() + 60 * 60 * 1000);
    // `enabled` keeps its value: it is not a change and keeps its author.
    const response = await patch('other-manager', {
      enabled: true,
      dailyReplyLimit: 150,
      debounceSeconds: 5,
    }).expect(200);

    expect(response.body.data).toMatchObject({
      enabled: true,
      dailyReplyLimit: 150,
      debounceSeconds: 5,
      changes: {
        ...NO_CHANGES,
        enabled: {
          changedBy: { id: MANAGER.id, name: 'Gerente' },
          changedAt: NOW.toISOString(),
        },
        dailyReplyLimit: {
          changedBy: { id: OTHER_MANAGER.id, name: 'Otra Gerente' },
          changedAt: now.toISOString(),
        },
        debounceSeconds: {
          changedBy: { id: OTHER_MANAGER.id, name: 'Otra Gerente' },
          changedAt: now.toISOString(),
        },
      },
    });
  });

  it('the next turn reads what was saved', async () => {
    await patch('manager', {
      enabled: true,
      simpleReplies: false,
      perContactDailyLimit: 10,
      maxWaitSeconds: 60,
    }).expect(200);

    const settings = app.get<AssistantSettingsRepositoryPort>(
      ASSISTANT_TOKENS.Settings
    );
    expect(await settings.get()).toEqual({
      enabled: true,
      simpleReplies: false,
      perContactDailyLimit: 10,
      debounceSeconds: 8,
      maxWaitSeconds: 60,
      dailyReplyLimit: 300,
    });
  });

  it.each([
    ['a limit below its range', { perContactDailyLimit: 0 }],
    ['a limit above its range', { dailyReplyLimit: 5001 }],
    ['a wait above its range', { debounceSeconds: 61 }],
    ['a fraction', { maxWaitSeconds: 1.5 }],
    ['a number as text', { dailyReplyLimit: '100' }],
    ['an unknown setting', { model: 'claude-opus-5-5' }],
    ['nothing to change', {}],
  ])('answers 400 to %s', async (_case, body) => {
    await patch('manager', body).expect(400);

    expect((await get('manager')).body.data.changes).toEqual(NO_CHANGES);
  });

  it('answers 400 if the maximum wait ends up below the wait', async () => {
    // Stored debounce is 8; only the maximum wait comes in the patch.
    const response = await patch('manager', { maxWaitSeconds: 5 }).expect(400);

    expect(response.body).toMatchObject({
      success: false,
      code: 'ASSISTANT_MAX_WAIT_BELOW_DEBOUNCE',
      error: 'La espera máxima no puede ser menor que la espera.',
    });
    expect((await get('manager')).body.data.maxWaitSeconds).toBe(30);
  });
});
