import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChatsService } from '../../infrastructure';
import { chatsQueryKeys } from '../queries/useConversations.query';

/** Pause the assistant in a chat, or mark the chat as resolved. */
export function useConversationActions(conversationId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: chatsQueryKeys.conversations() });

  const pause = useMutation({
    mutationFn: () => ChatsService.pauseAssistant(conversationId),
    onSuccess: refresh,
  });
  const resolve = useMutation({
    mutationFn: () => ChatsService.resolve(conversationId),
    onSuccess: refresh,
  });

  return {
    pauseAssistant: () => pause.mutate(),
    isPausing: pause.isPending,
    resolve: () => resolve.mutate(),
    isResolving: resolve.isPending,
    error: pause.error ?? resolve.error,
  };
}
