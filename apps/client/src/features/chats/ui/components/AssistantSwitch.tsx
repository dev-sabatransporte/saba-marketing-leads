'use client';

import { Label } from '@repo/ui/components/label';
import { Switch } from '@repo/ui/components/switch';
import React from 'react';
import { useAssistantSwitch } from '../../application/mutations/useAssistantSwitch.mutation';
import type { Conversation } from '../../domain/chat.model';

export function AssistantSwitch({
  conversation,
}: {
  conversation: Conversation;
}): React.JSX.Element {
  const { setEnabled, isSaving, error } = useAssistantSwitch(conversation.id);
  const id = `assistant-switch-${conversation.id}`;

  return (
    <div className="flex shrink-0 items-center gap-2">
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error.message || 'No se pudo cambiar el asistente'}
        </p>
      )}
      <Label htmlFor={id} className="text-muted-foreground text-xs">
        🤖 Asistente
      </Label>
      <Switch
        id={id}
        checked={conversation.assistantEnabled}
        disabled={isSaving}
        onCheckedChange={setEnabled}
      />
    </div>
  );
}
