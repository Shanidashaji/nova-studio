import { HttpStatus, Injectable } from '@nestjs/common';
import { hashPassword, verifyPassword } from '@nova/db';
import type { LoginRequest } from '@nova/shared';
import { AppError } from '../common/errors';
import { DatabaseService } from '../database/database.service';
import { ActivityService } from '../modules/activity/activity.service';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  /** Verified against when the email is unknown, so response time does not reveal accounts. */
  private readonly dummyHash = hashPassword('nova-timing-equaliser');

  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionService,
    private readonly activity: ActivityService,
  ) {}

  async login(input: LoginRequest, meta: { ip?: string; userAgent?: string }) {
    const user = await this.database.models.User.findOne({ email: input.email }).lean();
    const valid = user
      ? await verifyPassword(user.passwordHash, input.password)
      : await verifyPassword(await this.dummyHash, input.password).then(() => false);

    if (!user || !valid || !user.isActive) {
      throw new AppError(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'The email or password is incorrect.',
      );
    }

    const { token } = await this.sessions.create(user.id, meta);
    await this.database.models.User.updateOne(
      { _id: user.id },
      { $set: { lastLoginAt: new Date() } },
    );
    await this.activity.log({
      actorId: user.id,
      action: 'auth.login',
      entityType: 'auth',
      entityId: user.id,
      summary: `${user.name} signed in`,
    });

    const resolved = await this.sessions.resolve(token);
    return { token, user: resolved!.user };
  }

  /** Revokes the session behind `token`. Unknown or expired tokens are a no-op. */
  async logout(token: string) {
    const resolved = await this.sessions.resolve(token);
    if (!resolved) return;
    const { sessionId, user } = resolved;
    await this.sessions.destroy(sessionId);
    await this.activity.log({
      actorId: user.id,
      action: 'auth.logout',
      entityType: 'auth',
      entityId: user.id,
      summary: `${user.name} signed out`,
    });
  }
}
