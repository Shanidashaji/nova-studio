import type { INestApplication } from '@nestjs/common';
import { connectDatabase, hashPassword, type Database } from '@nova/db';
import type { Server } from 'node:http';
import request from 'supertest';

export const ADMIN = { email: 'admin@test.local', password: 'test-admin-password-123' };
export const PRODUCER = { email: 'producer@nova.local', password: 'producer-test-password' };
export const VIEWER = { email: 'viewer@nova.local', password: 'viewer-test-password' };
export const FINANCE = { email: 'finance@nova.local', password: 'finance-test-password' };
export const HR = { email: 'hr@nova.local', password: 'hr-test-password-1' };
export const CREATIVE = { email: 'creative@nova.local', password: 'creative-test-password' };
export const ORIGIN = 'http://localhost:3100';

/** Boots the compiled API (dist/) — the same code that runs in production. */
export async function bootApp(): Promise<INestApplication> {
  // A non-literal specifier keeps TypeScript from type-checking compiled JS; types come from src.
  const compiled = '../dist/bootstrap.js';
  const { createApp } = (await import(compiled)) as typeof import('../src/bootstrap');
  const app = await createApp({ logger: false });
  await app.init();
  return app;
}

/** Direct database access for arranging and asserting test state. Close it in afterAll. */
export function testDb(): Promise<Database> {
  return connectDatabase(process.env.TEST_DATABASE_URL, { maxPoolSize: 2 });
}

/** Awaits a lean read and fails the test when nothing matched (the former `…OrThrow`). */
export async function found<T>(query: PromiseLike<T | null>, what = 'Record'): Promise<T> {
  const value = await query;
  if (value === null || value === undefined) throw new Error(`${what} not found.`);
  return value;
}

/** The seed generates random demo passwords; tests set known ones. */
export async function setKnownPasswords(db: Database) {
  for (const u of [PRODUCER, VIEWER, FINANCE, HR, CREATIVE]) {
    await db.models.User.updateOne(
      { email: u.email },
      { $set: { passwordHash: await hashPassword(u.password) } },
    );
  }
}

/** Signs in and returns a supertest agent that carries the session cookie. */
export async function signIn(app: INestApplication, creds: { email: string; password: string }) {
  const agent = request.agent(app.getHttpServer() as Server);
  const res = await agent.post('/api/v1/auth/login').set('origin', ORIGIN).send(creds);
  if (res.status !== 200)
    throw new Error(`Sign-in failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}
