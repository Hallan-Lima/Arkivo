import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Kysely } from 'kysely';
import { InjectDb } from '../database/database.module';
import type { DB, UserRole } from '../database/types';
import { IS_PUBLIC, MIN_ROLE, ROLE_RANK } from './public.decorator';
import { AUTH_COOKIE } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectDb() private readonly db: Kysely<DB>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const token: string | undefined = req.cookies?.[AUTH_COOKIE];
    if (!token) throw new UnauthorizedException();

    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }

    const user = await this.db
      .selectFrom('users')
      .select(['id', 'workspace_id', 'name', 'email', 'role', 'active'])
      .where('id', '=', payload.sub)
      .executeTakeFirst();
    if (!user || !user.active) throw new UnauthorizedException();

    req.user = { id: user.id, workspaceId: user.workspace_id, name: user.name, email: user.email, role: user.role };

    const minRole = this.reflector.getAllAndOverride<UserRole>(MIN_ROLE, targets);
    if (minRole && ROLE_RANK[user.role] < ROLE_RANK[minRole]) {
      throw new ForbiddenException('Permissão insuficiente');
    }
    return true;
  }
}
