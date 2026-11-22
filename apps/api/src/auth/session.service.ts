import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Permission, SessionUser } from '@nova/shared';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';

export const SESSION_COOKIE = 'nova_session';

const HOUR = 60 * 60 * 1000;
/** Avoid a database write on every request: refresh `lastSeenAt` at most this often. */
const TOUCH_INTERVAL = 5 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Opaque, database-backed sessions (ADR-0004). The browser holds a random 256-bit token;
 * the database stores only its SHA-256 hash.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get ttlMs() {
    return this.env.SESSION_TTL_HOURS * HOUR;
  }

  async create(userId: string, meta: { ip?: string; userAgent?: string }) {
    const token = randomBytes(32).toString('base64url');
    const session = await this.prisma.db.session.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        expiresAt: new Date(Date.now() + this.ttlMs),
        ip: meta.ip?.slice(0, 64),
        userAgent: meta.userAgent?.slice(0, 256),
      },
    });
    return { token, session };
  }

  /** Resolves a token to its user, enforcing absolute expiry, idle timeout and account status. */
  async resolve(token: string): Promise<{ sessionId: string; user: SessionUser } | null> {
    if (!token || token.length > 128) return null;
    const session = await this.prisma.db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    if (!session) return null;

    const now = Date.now();
    const idleLimit = session.lastSeenAt.getTime() + this.env.SESSION_IDLE_HOURS * HOUR;
    if (session.expiresAt.getTime() <= now || idleLimit <= now || !session.user.isActive) {
      await this.prisma.db.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL) {
      await this.prisma.db.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      });
    }

    const { user } = session;
    return {
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: { key: user.role.key, name: user.role.name },
        permissions: user.role.permissions.map((rp) => rp.permission.key as Permission),
      },
    };
  }

  async destroy(sessionId: string) {
    await this.prisma.db.session.deleteMany({ where: { id: sessionId } });
  }

  async destroyAllForUser(userId: string) {
    await this.prisma.db.session.deleteMany({ where: { userId } });
  }
}
