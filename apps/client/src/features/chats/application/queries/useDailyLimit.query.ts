import { useQuery } from '@tanstack/react-query';
import { ChatsService } from '../../infrastructure';
import { chatsQueryKeys } from './useConversations.query';

// It changes at most twice a day: when the limit is hit and at midnight.
const DAILY_LIMIT_REFRESH_MS = 60_000;

export function useDailyLimit() {
  return useQuery({
    queryKey: chatsQueryKeys.dailyLimit(),
    queryFn: () => ChatsService.isDailyLimitReached(),
    refetchInterval: DAILY_LIMIT_REFRESH_MS,
  });
}
