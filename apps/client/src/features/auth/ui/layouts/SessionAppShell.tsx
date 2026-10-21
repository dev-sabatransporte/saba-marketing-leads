'use client';

import React from 'react';
import { AppShell } from '@/shared/ui/layouts/AppShell';
import { useSessionUser } from '../../application/queries/useSessionUser.query';
import { UserMenu } from '../widgets/UserMenu';

/** The panel frame for who holds the session: their menu and their user. */
export function SessionAppShell({
  defaultOpen,
  children,
}: {
  defaultOpen: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const user = useSessionUser();

  return (
    <AppShell
      defaultOpen={defaultOpen}
      permissions={user.data?.permissions ?? []}
      sidebarFooter={<UserMenu />}
    >
      {children}
    </AppShell>
  );
}
