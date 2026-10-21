'use client';

import { Button } from '@repo/ui/components/button';
import { CheckCheck, PauseCircle } from 'lucide-react';
import React from 'react';
import { useConversationActions } from '../../application/mutations/useConversationActions.mutation';
import type { Conversation } from '../../domain/chat.model';

export function ConversationActions({
  conversation,
}: {
  conversation: Conversation;
}): React.JSX.Element {
  const { pauseAssistant, isPausing, resolve, isResolving, error } =
    useConversationActions(conversation.id);

  return (
    <div className="flex shrink-0 items-center gap-2">
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error.message || 'No se pudo completar la acción'}
        </p>
      )}
      {conversation.assistantPaused ? (
        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
          Asistente en pausa
        </span>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPausing}
          onClick={pauseAssistant}
        >
          <PauseCircle aria-hidden="true" />
          Pausar asistente
        </Button>
      )}
      {conversation.status === 'open' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isResolving}
          onClick={resolve}
        >
          <CheckCheck aria-hidden="true" />
          Marcar como resuelto
        </Button>
      )}
    </div>
  );
}
