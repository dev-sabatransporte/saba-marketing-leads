import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ASSISTANT_SETTINGS } from '../../modules/assistant/domain/AssistantSettings';
import {
  assistantRuns,
  assistantSettings,
} from '../../modules/assistant/infrastructure/persistence/assistant.schema';
import { DrizzleAssistantRunsRepository } from '../../modules/assistant/infrastructure/persistence/DrizzleAssistantRunsRepository';
import { DrizzleAssistantSettingsRepository } from '../../modules/assistant/infrastructure/persistence/DrizzleAssistantSettingsRepository';
import { closeTestDb, getTestDb, resetDatabase } from '../support/testDatabase';

describe('assistant persistence (against Postgres)', () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('reads the settings row, and stays off if the row is missing', async () => {
    const settings = new DrizzleAssistantSettingsRepository(getTestDb());
    expect(await settings.get()).toEqual(DEFAULT_ASSISTANT_SETTINGS);
    expect(DEFAULT_ASSISTANT_SETTINGS.enabled).toBe(false);

    await getTestDb()
      .insert(assistantSettings)
      .values({ enabled: true, debounceSeconds: 5 });

    expect(await settings.get()).toEqual({
      ...DEFAULT_ASSISTANT_SETTINGS,
      enabled: true,
      debounceSeconds: 5,
    });
  });

  it('allows a single settings row', async () => {
    await getTestDb().insert(assistantSettings).values({});
    await expect(
      getTestDb().insert(assistantSettings).values({ id: 2 })
    ).rejects.toThrow();
  });

  it('records a turn with its messages, model, tokens, tools and latency', async () => {
    const conversationId = crypto.randomUUID();
    const inboundId = crypto.randomUUID();
    const sentId = crypto.randomUUID();

    await new DrizzleAssistantRunsRepository(getTestDb()).record({
      conversationId,
      inboundMessageIds: [inboundId],
      sentMessageId: sentId,
      outcome: 'answered',
      reason: null,
      errorDetail: null,
      model: 'claude-sonnet-5-5',
      usage: {
        inputTokens: 120,
        outputTokens: 40,
        cacheReadTokens: 900,
        cacheWriteTokens: 0,
      },
      toolCalls: [
        { tool: 'search_products', query: 'bera 150', resultCount: 2 },
        { tool: 'search_products', query: 'bera', resultCount: null },
      ],
      latencyMs: 1500,
    });

    const [run] = await getTestDb().select().from(assistantRuns);
    expect(run).toMatchObject({
      conversationId,
      inboundMessageIds: [inboundId],
      sentMessageId: sentId,
      outcome: 'answered',
      model: 'claude-sonnet-5-5',
      inputTokens: 120,
      outputTokens: 40,
      cacheReadTokens: 900,
      cacheWriteTokens: 0,
      toolCalls: [
        { tool: 'search_products', query: 'bera 150', resultCount: 2 },
        { tool: 'search_products', query: 'bera', resultCount: null },
      ],
      latencyMs: 1500,
    });
  });
});
