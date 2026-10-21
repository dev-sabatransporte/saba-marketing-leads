import type { TSessionUser } from '@repo/schemas';
import type { SessionUser } from '../domain/sessionUser.model';

export function toSessionUser(dto: TSessionUser): SessionUser {
  return {
    id: dto.id,
    email: dto.email,
    name: dto.name,
    role: dto.role,
    permissions: dto.permissions,
  };
}
