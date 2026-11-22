import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Permission, SessionUser } from '@nova/shared';
import { ENV, type Env } from '../config/env';
import type { Permission as PermissionRow, Role, RolePermission, Session, User } from '@nova/db';
import { DatabaseService } from '../database/database.service';

export const SESSION_COOKIE = 'nova_session';

const HOUR = 60 * 60 * 1000;
/** Avoid a database write on every request: refresh `lastSeenAt` at most this often. */
const TOUCH_INTERVAL = 5 * 60 * 1000;

type ResolvedSession = Session & {
  user:
    | (User & {
        role:
          | (Role & { permissions: (RolePermission & { permission: PermissionRow | null })[] })
          | null;
      })
    | null;
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Opaque, database-backed sessions (ADR-0004). The browser holds a random 256-bit token;
 * the database stores only its SHA-256 hash.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get ttlMs() {
    return this.env.SESSION_TTL_HOURS * HOUR;
  }

  async create(userId: string, meta: { ip?: string; userAgent?: string }) {
    const token = randomBytes(32).toString('base64url');
    const doc = await this.database.models.Session.create({
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + this.ttlMs),
      ip: meta.ip?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 256) ?? null,
    });
    return { token, session: doc.toObject() as Session };
  }

  /** Resolves a token to its user, enforcing absolute expiry, idle timeout and account status. */
  async resolve(token: string): Promise<{ sessionId: string; user: SessionUser } | null> {
    if (!token || token.length > 128) return null;
    const { Session: Sessions } = this.database.models;
    const session = await Sessions.findOne({ tokenHash: hashToken(token) })
      .populate({
        path: 'user',
        populate: {
          path: 'role',
          populate: { path: 'permissions', populate: { path: 'permission' } },
        },
      })
      .lean<ResolvedSession>();
    if (!session) return null;
    const user = session.user;
    const role = user?.role;

    const now = Date.now();
    const idleLimit = session.lastSeenAt.getTime() + this.env.SESSION_IDLE_HOURS * HOUR;
    if (session.expiresAt.getTime() <= now || idleLimit <= now || !user?.isActive || !role) {
      await Sessions.deleteOne({ _id: session.id }).catch(() => undefined);
      return null;
    }
    if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL) {
      await Sessions.updateOne({ _id: session.id }, { $set: { lastSeenAt: new Date(now) } });
    }

    return {
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: { key: role.key, name: role.name },
        permissions: role.permissions.flatMap((rp) =>
          rp.permission ? [rp.permission.key as Permission] : [],
        ),
      },
    };
  }

  async destroy(sessionId: string) {
    await this.database.models.Session.deleteMany({ _id: sessionId });
  }

  async destroyAllForUser(userId: string) {
    await this.database.models.Session.deleteMany({ userId });
  }
}
