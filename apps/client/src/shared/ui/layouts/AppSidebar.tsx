'use client';

import type { TPermission } from '@repo/schemas';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@repo/ui/components/sidebar';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';
import { isNavItemActive, navigationFor } from './navigation';

/**
 * The panel's sidebar: logo, navigation and, at the bottom, whatever it gets in
 * `sidebarFooter` (the user menu, which lives in the auth feature: `shared`
 * does not import features). Items needing a permission show only with it.
 */
export function AppSidebar({
  footer,
  permissions,
}: {
  footer?: React.ReactNode;
  permissions: readonly TPermission[];
}): React.JSX.Element {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          aria-label="Saba Marketing Leads — inicio"
          className="flex h-10 items-center px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          href="/"
        >
          <img
            alt="Saba"
            className="h-6 w-auto group-data-[collapsible=icon]:hidden"
            height={305}
            src="/logos/logo.png"
            width={1017}
          />
          <img
            alt="Saba"
            className="hidden size-7 group-data-[collapsible=icon]:block"
            height={305}
            src="/logos/iso.png"
            width={305}
          />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {navigationFor(permissions).map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isNavItemActive(item.href, pathname)}
                      tooltip={item.label}
                    >
                      <Link
                        href={item.href}
                        onClick={() => isMobile && setOpenMobile(false)}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {footer && <SidebarFooter>{footer}</SidebarFooter>}
      <SidebarRail />
    </Sidebar>
  );
}
