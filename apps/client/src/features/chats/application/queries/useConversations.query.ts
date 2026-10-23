import { queryOptions, useQuery } from '@tanstack/react-query';
import { ChatsService } from '../../infrastructure';

/** No real-time push (phase 1): the list refreshes itself. */
const LIST_REFRESH_MS = 10_000;

export const chatsQueryKeys = {
  all: () => ['chats'] as const,
  conversations: () => [...chatsQueryKeys.all(), 'conversations'] as const,
  dailyLimit: () => [...chatsQueryKeys.all(), 'dailyLimit'] as const,
  messages: (conversationId: string) =>
    [...chatsQueryKeys.all(), 'messages', conversationId] as const,
  messageExplanation: (messageId: string) =>
    [...chatsQueryKeys.all(), 'messageExplanation', messageId] as const,
};

export function conversationsQueryOptions() {
  return queryOptions({
    queryKey: chatsQueryKeys.conversations(),
    queryFn: () => ChatsService.listConversations(),
    refetchInterval: LIST_REFRESH_MS,
  });
}

export function useConversations() {
  return useQuery(conversationsQueryOptions());
}
