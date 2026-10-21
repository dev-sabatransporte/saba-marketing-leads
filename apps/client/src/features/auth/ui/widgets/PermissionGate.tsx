'use client';

import type { TPermission } from '@repo/schemas';
import { LockKeyhole } from 'lucide-react';
import React from 'react';
import { useSessionUser } from '../../application/queries/useSessionUser.query';

/**
 * Renders `children` only to whoever has `permission`, so a screen without
 * access does not even ask the API (which would reject it anyway).
 */
export function PermissionGate({
  permission,
  children,
}: {
  permission: TPermission;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const user = useSessionUser();

  if (!user.data) return null;
  if (user.data.permissions.includes(permission)) return <>{children}</>;

  return (
    <div className="px-5 py-12 text-center text-muted-foreground">
      <LockKeyhole aria-hidden="true" className="mx-auto mb-2.5 size-10" />
      <p className="mb-1 font-bold text-foreground text-sm">
        No tienes acceso a esta sección
      </p>
      <p className="text-[12.5px]">
        Pídele a un administrador de Saba que te dé el permiso.
      </p>
    </div>
  );
}
