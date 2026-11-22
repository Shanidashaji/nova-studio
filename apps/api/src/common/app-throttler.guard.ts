import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthedRequest } from './decorators';

/**
 * The general request limit, applied to every route (`RATE_LIMIT_PER_MINUTE`, default 600).
 *
 * It runs after the session guard, so a signed-in caller is counted per user: people who share
 * an office address do not use up each other's allowance, and one account cannot be driven
 * harder by spreading requests over addresses. Public routes (sign-in, sign-out, health) are
 * counted per client address; sign-in carries a much lower limit of its own.
 *
 * Requests without a valid session are refused by the session guard before they reach this
 * guard and are not counted. Volumetric floods belong to the reverse proxy in front of the app.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: AuthedRequest): Promise<string> {
    return Promise.resolve(req.user ? `user:${req.user.id}` : `ip:${req.ip ?? 'unknown'}`);
  }
}
