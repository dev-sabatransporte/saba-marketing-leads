import { useQuery } from '@tanstack/react-query';
import { ChatsService } from '../../infrastructure';
import { chatsQueryKeys } from './useConversations.query';

/** Fetched only when asked for; a sent turn never changes. */
export function useMessageExplanation(messageId: string, enabled: boolean) {
  return useQuery({
    queryKey: chatsQueryKeys.messageExplanation(messageId),
    queryFn: () => ChatsService.explainMessage(messageId),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
