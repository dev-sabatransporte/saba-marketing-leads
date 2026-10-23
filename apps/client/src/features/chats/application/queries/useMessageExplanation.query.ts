import { useQuery } from '@tanstack/react-query';
import { ChatsService } from '../../infrastructure';
import { chatsQueryKeys } from './useConversations.query';

// A sent turn never changes: once fetched, it is kept.
export function useMessageExplanation(messageId: string) {
  return useQuery({
    queryKey: chatsQueryKeys.messageExplanation(messageId),
    queryFn: () => ChatsService.explainMessage(messageId),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
