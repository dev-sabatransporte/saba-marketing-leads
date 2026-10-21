import type { TPermission } from '@repo/schemas';
import {
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Settings,
} from 'lucide-react';

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown only to whoever has it; the API enforces it anyway. */
  permission?: TPermission;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

/** The panel's menu. A new item is added here, not in the component. */
export const NAVIGATION: NavigationGroup[] = [
  {
    label: 'General',
    items: [
      { label: 'Inicio', href: '/', icon: LayoutDashboard },
      { label: 'Chats', href: '/chats', icon: MessageSquare },
    ],
  },
  {
    label: 'Administración',
    items: [
      {
        label: 'Ajustes',
        href: '/settings',
        icon: Settings,
        permission: 'assistant:manage',
      },
    ],
  },
];

/** The menu for these permissions: groups left without items disappear. */
export function navigationFor(
  permissions: readonly TPermission[]
): NavigationGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.permission || permissions.includes(item.permission)
    ),
  })).filter((group) => group.items.length > 0);
}

/** `/chats/123` still highlights "Chats"; `/` only highlights itself. */
export function isNavItemActive(href: string, pathname: string): boolean {
  return href === '/'
    ? pathname === '/'
    : pathname === href || pathname.startsWith(`${href}/`);
}
