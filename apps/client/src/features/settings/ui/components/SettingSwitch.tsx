'use client';

import { Label } from '@repo/ui/components/label';
import { Switch } from '@repo/ui/components/switch';
import React from 'react';
import { useUpdateAssistantSettings } from '../../application/mutations/useUpdateAssistantSettings.mutation';
import type { SettingChange } from '../../domain/assistantSettings.model';
import { SettingChangeNote } from './SettingChangeNote';

/** An on/off setting that saves as soon as it is flipped. */
export function SettingSwitch({
  setting,
  label,
  description,
  checked,
  change,
}: {
  setting: 'enabled' | 'simpleReplies';
  label: string;
  description: string;
  checked: boolean;
  change: SettingChange | null;
}): React.JSX.Element {
  const { update, isSaving, error } = useUpdateAssistantSettings();
  const id = `assistant-setting-${setting}`;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground text-sm">{description}</p>
        <SettingChangeNote change={change} />
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error.message || 'No se pudo guardar el ajuste.'}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={isSaving}
        // The error is shown from the mutation state; nothing left to handle.
        onCheckedChange={(value) =>
          update({ [setting]: value }).catch(() => undefined)
        }
      />
    </div>
  );
}
