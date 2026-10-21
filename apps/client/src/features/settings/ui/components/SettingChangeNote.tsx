import React from 'react';
import {
  describeChange,
  type SettingChange,
} from '../../domain/assistantSettings.model';

export function SettingChangeNote({
  change,
}: {
  change: SettingChange | null;
}): React.JSX.Element {
  return (
    <p className="text-muted-foreground text-xs">{describeChange(change)}</p>
  );
}
