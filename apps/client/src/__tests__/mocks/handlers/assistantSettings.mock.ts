import type {
  TAssistantSettings,
  TAssistantWeeklySummary,
} from '@repo/schemas';
import { HttpResponse, http } from 'msw';
import { BACKEND_URL } from '@/__tests__/mocks/backendUrl';

export function assistantSettingsFixture(): TAssistantSettings {
  return {
    enabled: false,
    simpleReplies: true,
    perContactDailyLimit: 20,
    debounceSeconds: 8,
    maxWaitSeconds: 30,
    dailyReplyLimit: 300,
    changes: {
      enabled: {
        changedBy: { id: 'u-2', name: 'María Gómez' },
        changedAt: '2026-10-20T14:30:00.000Z',
      },
      simpleReplies: null,
      perContactDailyLimit: null,
      debounceSeconds: null,
      maxWaitSeconds: null,
      dailyReplyLimit: null,
    },
  };
}

export function weeklySummaryFixture(): TAssistantWeeklySummary {
  return {
    from: '2026-10-14T15:00:00.000Z',
    to: '2026-10-21T15:00:00.000Z',
    conversations: 40,
    resolvedWithoutPerson: 26,
    handoffsByReason: {
      out_of_scope: 3,
      customer_requested: 1,
      data_not_found: 0,
      non_text: 2,
      pricing: 7,
      out_of_stock: 0,
      limit_reached: 1,
      error: 0,
    },
    estimatedCostUsd: 1.2345,
    unpricedModels: [],
  };
}

export const assistantSettingsHandlers = [
  http.get(`${BACKEND_URL}/v1/assistant/settings`, () =>
    HttpResponse.json({ success: true, data: assistantSettingsFixture() })
  ),
  http.get(`${BACKEND_URL}/v1/assistant/weekly-summary`, () =>
    HttpResponse.json({ success: true, data: weeklySummaryFixture() })
  ),
];
