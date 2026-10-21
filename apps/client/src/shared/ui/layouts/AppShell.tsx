'use client';

import type { TPermission } from '@repo/schemas';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@repo/ui/components/sidebar';
import React from 'react';
import { AppSidebar } from './AppSidebar';

/**
 * Frame of the screens with a session. `defaultOpen` comes from the
 * `sidebar_state` cookie the layout reads on the server: that way the HTML
 * arrives with the sidebar in the right state and does not jump on hydration.
 */
export function AppShell({
  defaultOpen,
  permissions,
  sidebarFooter,
  children,
}: {
  defaultOpen: boolean;
  /** Of who holds the session, to pick the menu items; none while loading. */
  permissions: readonly TPermission[];
  sidebarFooter?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar footer={sidebarFooter} permissions={permissions} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center border-b px-3">
          <SidebarTrigger aria-label="Mostrar u ocultar el menú" />
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
