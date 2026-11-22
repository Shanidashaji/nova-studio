import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@nova/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, ORIGIN, bootApp, setKnownPasswords, signIn, testDb } from './helpers';

let app: INestApplication;
let db: PrismaClient;

beforeAll(async () => {
  app = await bootApp();
  db = testDb();
  await setKnownPasswords(db);
});

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

const http = () => request(app.getHttpServer() as Server);

describe('authentication', () => {
  it('exposes a public health check', async () => {
    const res = await http().get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('rejects protected routes without a session', async () => {
    const res = await http().get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('validates the login body', async () => {
    const res = await http()
      .post('/api/v1/auth/login')
      .set('origin', ORIGIN)
      .send({ email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'email' })]),
    );
  });

  it('returns the same error for unknown emails and wrong passwords', async () => {
    const unknown = await http()
      .post('/api/v1/auth/login')
      .set('origin', ORIGIN)
      .send({ email: 'ghost@test.local', password: 'whatever-123' });
    const wrong = await http()
      .post('/api/v1/auth/login')
      .set('origin', ORIGIN)
      .send({ email: ADMIN.email, password: 'wrong-password' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it('signs in with an HttpOnly, SameSite=Lax cookie and stores only a token hash', async () => {
    const res = await http().post('/api/v1/auth/login').set('origin', ORIGIN).send(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: ADMIN.email, role: { key: 'SUPER_ADMIN' } });
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/nova_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const token = /nova_session=([^;]+)/.exec(cookie)![1]!;
    const stored = await db.session.findUnique({
      where: { tokenHash: createHash('sha256').update(token).digest('hex') },
    });
    expect(stored).not.toBeNull();
    expect(await db.session.count({ where: { tokenHash: token } })).toBe(0);
  });

  it('accepts the session for /me and fully revokes it on logout', async () => {
    // One sign-in for every logout check: the login route is throttled to 10 per minute.
    const login = await http().post('/api/v1/auth/login').set('origin', ORIGIN).send(ADMIN);
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    const token = /nova_session=([^;]+)/.exec(cookie)![1]!;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const me = () => http().get('/api/v1/auth/me').set('cookie', cookie);
    const logout = (origin = ORIGIN) =>
      http().post('/api/v1/auth/logout').set('origin', origin).set('cookie', cookie);

    expect((await me()).status).toBe(200);

    // A cross-site logout is rejected and leaves the session alone.
    expect((await logout('https://attacker.example')).status).toBe(403);
    expect((await me()).status).toBe(200);

    const res = await logout();
    expect(res.status).toBe(204);
    expect(res.headers['cache-control']).toBe('no-store');
    const cleared = String(res.headers['set-cookie']);
    expect(cleared).toMatch(/nova_session=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cleared).toMatch(/HttpOnly/i);
    expect(await db.session.count({ where: { tokenHash } })).toBe(0);

    // The old token is dead even if a client kept a copy.
    expect((await me()).status).toBe(401);

    // Idempotent: a revoked, a bogus or a missing cookie still gets a 204 and a cleared cookie.
    expect((await logout()).status).toBe(204);
    const stale = await http()
      .post('/api/v1/auth/logout')
      .set('origin', ORIGIN)
      .set('cookie', 'nova_session=not-a-real-token');
    expect(stale.status).toBe(204);
    expect(String(stale.headers['set-cookie'])).toMatch(/nova_session=;/);
    expect((await http().post('/api/v1/auth/logout').set('origin', ORIGIN)).status).toBe(204);
  });

  it('rejects expired sessions', async () => {
    const agent = await signIn(app, ADMIN);
    const user = await db.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
    await db.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('rejects idle sessions', async () => {
    const agent = await signIn(app, ADMIN);
    const user = await db.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
    await db.session.updateMany({
      where: { userId: user.id },
      data: { lastSeenAt: new Date(Date.now() - 9 * 60 * 60 * 1000) },
    });
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('rejects deactivated users', async () => {
    const agent = await signIn(app, ADMIN);
    await db.user.update({ where: { email: ADMIN.email }, data: { isActive: false } });
    try {
      expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    } finally {
      await db.user.update({ where: { email: ADMIN.email }, data: { isActive: true } });
    }
  });

  it('rejects state-changing requests from another origin', async () => {
    const res = await http()
      .post('/api/v1/auth/login')
      .set('origin', 'https://attacker.example')
      .send(ADMIN);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BAD_ORIGIN');
  });

  it('records sign-in and sign-out in the activity log', async () => {
    const agent = await signIn(app, ADMIN);
    await agent.post('/api/v1/auth/logout').set('origin', ORIGIN);
    const user = await db.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
    const actions = await db.activityLog.findMany({
      where: { actorId: user.id, action: { in: ['auth.login', 'auth.logout'] } },
    });
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(['auth.login', 'auth.logout']),
    );
  });

  it('rate-limits repeated login attempts', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await http()
        .post('/api/v1/auth/login')
        .set('origin', ORIGIN)
        .send({ email: 'flood@test.local', password: 'x' });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});
