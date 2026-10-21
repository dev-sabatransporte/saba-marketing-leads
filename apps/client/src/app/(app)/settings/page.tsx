import { PermissionGate } from '@/features/auth/ui/widgets/PermissionGate';
import { SettingsPage } from '@/features/settings/ui/pages/SettingsPage';

export default function Page() {
  return (
    <PermissionGate permission="assistant:manage">
      <SettingsPage />
    </PermissionGate>
  );
}
