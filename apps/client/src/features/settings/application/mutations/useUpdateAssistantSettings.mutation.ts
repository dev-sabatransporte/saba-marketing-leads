'use client';

import type { TUpdateAssistantSettings } from '@repo/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AssistantSettings } from '../../domain/assistantSettings.model';
import { AssistantSettingsService } from '../../infrastructure';
import { settingsQueryKeys } from '../queries/useAssistantSettings.query';

export interface UpdateAssistantSettings {
  update: (patch: TUpdateAssistantSettings) => Promise<AssistantSettings>;
  isSaving: boolean;
  isSaved: boolean;
  error: Error | null;
}

/** One per control, so each shows its own saving state and error. */
export function useUpdateAssistantSettings(): UpdateAssistantSettings {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (patch: TUpdateAssistantSettings) =>
      AssistantSettingsService.update(patch),
    // The API answers with the saved settings: no need to ask again.
    onSuccess: (settings) =>
      queryClient.setQueryData(settingsQueryKeys.assistant(), settings),
  });
  return {
    update: mutation.mutateAsync,
    isSaving: mutation.isPending,
    isSaved: mutation.isSuccess,
    error: mutation.error,
  };
}
