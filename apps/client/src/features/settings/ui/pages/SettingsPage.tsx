import React from 'react';
import { AssistantSettingsCard } from '../widgets/AssistantSettingsCard';

export function SettingsPage(): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="font-bold text-2xl">Ajustes</h1>
        <p className="text-muted-foreground text-sm">
          Configuración del panel.
        </p>
      </header>
      <AssistantSettingsCard />
    </div>
  );
}
