'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card';
import { Separator } from '@repo/ui/components/separator';
import React from 'react';
import { useUpdateAssistantSettings } from '../../application/mutations/useUpdateAssistantSettings.mutation';
import { useAssistantSettings } from '../../application/queries/useAssistantSettings.query';
import type {
  AssistantLimits,
  AssistantSettings,
} from '../../domain/assistantSettings.model';
import { AssistantLimitsForm } from '../components/AssistantLimitsForm';
import { SettingSwitch } from '../components/SettingSwitch';

function limitsOf(settings: AssistantSettings): AssistantLimits {
  return {
    perContactDailyLimit: settings.perContactDailyLimit,
    debounceSeconds: settings.debounceSeconds,
    maxWaitSeconds: settings.maxWaitSeconds,
    dailyReplyLimit: settings.dailyReplyLimit,
  };
}

/** The "Asistente" section: its switch and limits, applied from the next turn. */
export function AssistantSettingsCard(): React.JSX.Element {
  const { data: settings, isPending, error } = useAssistantSettings();
  const limits = useUpdateAssistantSettings();
  const titleId = React.useId();

  async function saveLimits(values: AssistantLimits): Promise<void> {
    // The error is shown from the mutation state.
    await limits.update(values).catch(() => undefined);
  }

  return (
    <Card role="region" aria-labelledby={titleId} className="w-full">
      <CardHeader>
        <CardTitle id={titleId}>Asistente</CardTitle>
        <CardDescription>
          Responde por WhatsApp las preguntas de productos, sedes y horarios.
          Los cambios aplican desde el siguiente mensaje que atienda.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {isPending && (
          <p className="text-muted-foreground text-sm">Cargando ajustes…</p>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            No se pudieron cargar los ajustes: {error.message}
          </p>
        )}
        {settings && (
          <>
            <SettingSwitch
              setting="enabled"
              label="Asistente encendido"
              description="Apagado, no responde en ningún chat."
              checked={settings.enabled}
              change={settings.changes.enabled}
            />
            <SettingSwitch
              setting="simpleReplies"
              label="Respuestas simples"
              description="Respuestas más cortas, que gastan menos."
              checked={settings.simpleReplies}
              change={settings.changes.simpleReplies}
            />
            <Separator />
            <AssistantLimitsForm
              // Remounts with what was saved, so the form is no longer dirty.
              key={JSON.stringify(limitsOf(settings))}
              defaultValues={limitsOf(settings)}
              changes={settings.changes}
              onSubmit={saveLimits}
            />
            {limits.isSaved && (
              <p role="status" className="text-muted-foreground text-sm">
                Límites guardados.
              </p>
            )}
            {limits.error && (
              <p role="alert" className="text-destructive text-sm">
                {limits.error.message || 'No se pudieron guardar los límites.'}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
