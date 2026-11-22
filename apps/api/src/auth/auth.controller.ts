import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { LoginRequest, type SessionUser } from '@nova/shared';
import type { Response } from 'express';
import { CurrentUser, Public, type AuthedRequest } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ENV, type Env } from '../config/env';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Ten attempts per minute per client; generic error on failure. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(LoginRequest)) body: LoginRequest,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: SessionUser }> {
    const { token, user } = await this.auth.login(body, {
      ip: req.ip,
      userAgent: req.header('user-agent'),
    });
    res.cookie(SESSION_COOKIE, token, { ...this.cookieOptions(), maxAge: this.sessions.ttlMs });
    return { user };
  }

  /**
   * Idempotent sign-out. Public on purpose: a browser holding an expired or already-revoked
   * cookie must still be able to clear it, so the session is revoked if it exists and the cookie
   * is always expired. The CSRF origin check still applies (RequestContextMiddleware).
   */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (token) await this.auth.logout(token);
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
    res.setHeader('Cache-Control', 'no-store');
  }

  @Get('me')
  me(
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) res: Response,
  ): { user: SessionUser } {
    res.setHeader('Cache-Control', 'no-store');
    return { user };
  }

  /** The same attributes on set and clear, so the browser matches and removes the cookie. */
  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.env.NODE_ENV === 'production',
      path: '/',
    };
  }
}
