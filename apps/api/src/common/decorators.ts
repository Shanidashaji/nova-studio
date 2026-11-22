import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission, SessionUser } from '@nova/shared';
import type { Request } from 'express';

export const IS_PUBLIC = 'nova:isPublic';
export const PERMISSIONS_KEY = 'nova:permissions';
export const ANY_PERMISSIONS_KEY = 'nova:anyPermissions';

/** Opts a route out of the global session guard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Requires every listed permission. Checked by PermissionsGuard after authentication. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Requires at least one of the listed permissions. */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);

export interface AuthedRequest extends Request {
  id?: string;
  user?: SessionUser;
  sessionId?: string;
}

/** The authenticated user for this request. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});
