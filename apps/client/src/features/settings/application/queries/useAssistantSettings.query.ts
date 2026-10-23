'use client';

import { useQuery } from '@tanstack/react-query';
import { AssistantSettingsService } from '../../infrastructure';

export const settingsQueryKeys = {
  assistant: () => ['settings', 'assistant'] as const,
  weeklySummary: () => ['settings', 'weekly-summary'] as const,
};

export function useAssistantSettings() {
  return useQuery({
    queryKey: settingsQueryKeys.assistant(),
    queryFn: () => AssistantSettingsService.get(),
  });
}
