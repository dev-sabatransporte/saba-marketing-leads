import type { TAssistantSettings } from '@repo/schemas';
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

export const assistantSettingsHandlers = [
  http.get(`${BACKEND_URL}/v1/assistant/settings`, () =>
    HttpResponse.json({ success: true, data: assistantSettingsFixture() })
  ),
];
