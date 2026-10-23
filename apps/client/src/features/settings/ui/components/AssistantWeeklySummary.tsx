'use client';

import React from 'react';
import { useWeeklySummary } from '../../application/queries/useWeeklySummary.query';
import {
  costLabel,
  handoffReasonLabel,
  resolvedRateLabel,
  windowLabel,
} from '../../domain/weeklySummary.model';

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-semibold text-xl tabular-nums">{value}</dd>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

/** How the assistant did over the last 7 days, to judge whether it helps. */
export function AssistantWeeklySummary(): React.JSX.Element {
  const { data: summary, isPending, error } = useWeeklySummary();
  const titleId = React.useId();
  const handoffsId = React.useId();

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={titleId} className="font-semibold">
          Últimos 7 días
        </h3>
        {summary && (
          <p className="text-muted-foreground text-xs">
            {windowLabel(summary)}
          </p>
        )}
      </div>
      {isPending && (
        <p className="text-muted-foreground text-sm">Cargando resumen…</p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          No se pudo cargar el resumen: {error.message}
        </p>
      )}
      {summary && (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Conversaciones atendidas"
              value={String(summary.conversations)}
            />
            <Stat
              label="Resueltas sin persona"
              value={resolvedRateLabel(summary)}
              hint={`${summary.resolvedWithoutPerson} de ${summary.conversations}`}
            />
            <Stat
              label="Costo estimado"
              value={costLabel(summary.estimatedCostUsd)}
              hint="Del modelo, por los tokens. Sin lo que cobra Meta."
            />
          </dl>
          {summary.unpricedModels.length > 0 && (
            <p role="status" className="text-muted-foreground text-xs">
              No incluye {summary.unpricedModels.join(', ')}: no hay tarifa
              cargada para ese modelo.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <h4 id={handoffsId} className="font-medium text-sm">
              Traspasos por motivo
            </h4>
            {summary.handoffs.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin traspasos.</p>
            ) : (
              <ul aria-labelledby={handoffsId} className="flex flex-col gap-1">
                {summary.handoffs.map(({ reason, count }) => (
                  <li
                    key={reason}
                    className="flex justify-between gap-4 text-sm"
                  >
                    <span>{handoffReasonLabel(reason)}</span>
                    <span className="tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
