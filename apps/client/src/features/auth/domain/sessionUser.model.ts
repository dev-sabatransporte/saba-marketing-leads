import type { TPermission } from '@repo/schemas';

export type StaffRole = 'admin' | 'cajero' | 'vendedor';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  /** Only to render: the API enforces them on every request. */
  permissions: TPermission[];
}

const ROLE_LABEL: Record<StaffRole, string> = {
  admin: 'Administrador',
  cajero: 'Cajero',
  vendedor: 'Vendedor',
};

export function roleLabel(role: StaffRole): string {
  return ROLE_LABEL[role];
}

/** Initials for the avatar: "Angel Hernández" → "AH". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
