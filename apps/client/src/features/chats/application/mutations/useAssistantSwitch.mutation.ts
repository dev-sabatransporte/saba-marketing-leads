'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChatsService } from '../../infrastructure';
import { chatsQueryKeys } from '../queries/useConversations.query';

export interface AssistantSwitch {
  setEnabled: (enabled: boolean) => void;
  isSaving: boolean;
  error: Error | null;
}

/** Turns the assistant on or off in one chat. */
export function useAssistantSwitch(conversationId: string): AssistantSwitch {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      ChatsService.setAssistant(conversationId, enabled),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: chatsQueryKeys.conversations(),
      }),
  });
  return {
    setEnabled: (enabled) => mutation.mutate(enabled),
    isSaving: mutation.isPending,
    error: mutation.error,
  };
}
