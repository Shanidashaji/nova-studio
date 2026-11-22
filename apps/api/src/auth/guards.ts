import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@nova/shared';
import { AppError, forbidden } from '../common/errors';
import {
  ANY_PERMISSIONS_KEY,
  IS_PUBLIC,
  PERMISSIONS_KEY,
  type AuthedRequest,
} from '../common/decorators';
import { SESSION_COOKIE, SessionService } from './session.service';

/** Global guard: every route requires a valid session unless marked @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    const resolved = token ? await this.sessions.resolve(token) : null;
    if (!resolved) {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Please sign in to continue.');
    }
    req.user = resolved.user;
    req.sessionId = resolved.sessionId;
    return true;
  }
}

/**
 * Global guard: enforces @RequirePermissions() (all of) and @RequireAnyPermission() (one of)
 * against the authenticated user's role, read from the database on every request.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const anyOf = this.reflector.getAllAndOverride<Permission[] | undefined>(ANY_PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length && !anyOf?.length) return true;
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) throw forbidden();
    if (required?.length && !required.every((p) => user.permissions.includes(p))) {
      throw forbidden();
    }
    if (anyOf?.length && !anyOf.some((p) => user.permissions.includes(p))) throw forbidden();
    return true;
  }
}
