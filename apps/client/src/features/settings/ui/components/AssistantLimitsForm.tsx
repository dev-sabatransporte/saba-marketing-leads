'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ASSISTANT_SETTINGS_RANGES,
  assistantLimitsSchema,
} from '@repo/schemas';
import { Button } from '@repo/ui/components/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/form';
import { Input } from '@repo/ui/components/input';
import React from 'react';
import { useForm } from 'react-hook-form';
import type {
  AssistantLimits,
  AssistantSettingKey,
  SettingChange,
} from '../../domain/assistantSettings.model';
import { SettingChangeNote } from './SettingChangeNote';

type LimitKey = keyof AssistantLimits;

const LIMIT_FIELDS: { name: LimitKey; label: string; hint: string }[] = [
  {
    name: 'perContactDailyLimit',
    label: 'Respuestas por cliente al día',
    hint: 'Al llegar, pasa el chat a un asesor.',
  },
  {
    name: 'debounceSeconds',
    label: 'Espera (segundos)',
    hint: 'Junta los mensajes seguidos del cliente antes de responder.',
  },
  {
    name: 'maxWaitSeconds',
    label: 'Espera máxima (segundos)',
    hint: 'Responde a más tardar este tiempo después del primer mensaje.',
  },
  {
    name: 'dailyReplyLimit',
    label: 'Respuestas totales al día',
    hint: 'Al llegar, no responde más hasta el día siguiente.',
  },
];

export function AssistantLimitsForm({
  defaultValues,
  changes,
  onSubmit,
}: {
  defaultValues: AssistantLimits;
  changes: Record<AssistantSettingKey, SettingChange | null>;
  onSubmit: (limits: AssistantLimits) => Promise<void>;
}): React.JSX.Element {
  const form = useForm<AssistantLimits>({
    resolver: zodResolver(assistantLimitsSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      {/* Zod gives the messages, in Spanish and next to each field. */}
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {LIMIT_FIELDS.map(({ name, label, hint }) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{label}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={ASSISTANT_SETTINGS_RANGES[name].min}
                      max={ASSISTANT_SETTINGS_RANGES[name].max}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={Number.isNaN(field.value) ? '' : field.value}
                      onChange={(event) =>
                        field.onChange(event.target.valueAsNumber)
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    {hint} Entre {ASSISTANT_SETTINGS_RANGES[name].min} y{' '}
                    {ASSISTANT_SETTINGS_RANGES[name].max}.
                  </FormDescription>
                  <FormMessage />
                  <SettingChangeNote change={changes[name]} />
                </FormItem>
              )}
            />
          ))}
        </div>
        <Button
          type="submit"
          className="self-start"
          disabled={!form.formState.isDirty || form.formState.isSubmitting}
        >
          Guardar límites
        </Button>
      </form>
    </Form>
  );
}
