import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '../database/types';

export const IS_PUBLIC = 'arkivo:isPublic';
export const MIN_ROLE = 'arkivo:minRole';

/** Rota acessível sem login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Papel mínimo exigido na rota (viewer < editor < admin). */
export const MinRole = (role: UserRole) => SetMetadata(MIN_ROLE, role);

export interface AuthUser {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const ROLE_RANK: Record<UserRole, number> = { viewer: 0, editor: 1, admin: 2 };
