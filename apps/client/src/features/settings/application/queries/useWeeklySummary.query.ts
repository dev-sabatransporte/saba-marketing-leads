'use client';

import { useQuery } from '@tanstack/react-query';
import { WeeklySummaryService } from '../../infrastructure';
import { settingsQueryKeys } from './useAssistantSettings.query';

export function useWeeklySummary() {
  return useQuery({
    queryKey: settingsQueryKeys.weeklySummary(),
    queryFn: () => WeeklySummaryService.get(),
  });
}
