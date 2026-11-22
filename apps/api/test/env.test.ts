import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

const base = { DATABASE_URL: 'mongodb+srv://u:p@cluster0.example.mongodb.net/nova' };

describe('WEB_ORIGIN', () => {
  it('defaults to the standard web port', () => {
    expect(loadEnv({ ...base }).WEB_ORIGIN).toEqual(['http://localhost:3100']);
  });

  it('accepts several comma-separated origins and normalises them', () => {
    expect(
      loadEnv({ ...base, WEB_ORIGIN: 'http://localhost:3000/, http://localhost:3100' }).WEB_ORIGIN,
    ).toEqual(['http://localhost:3000', 'http://localhost:3100']);
  });

  it('rejects an entry that is not a URL', () => {
    expect(() => loadEnv({ ...base, WEB_ORIGIN: 'http://localhost:3000,nope' })).toThrow(
      /Not a URL: nope/,
    );
  });
});

describe('DATABASE_URL', () => {
  it('accepts mongodb:// with several hosts and mongodb+srv://', () => {
    expect(
      loadEnv({ DATABASE_URL: 'mongodb://a:27017,b:27017/nova?replicaSet=rs0' }).DATABASE_URL,
    ).toBe('mongodb://a:27017,b:27017/nova?replicaSet=rs0');
    expect(loadEnv({ ...base }).DATABASE_URL).toBe(base.DATABASE_URL);
  });

  it('rejects a PostgreSQL URL', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/nova' })).toThrow(
      /DATABASE_URL/,
    );
  });
});

describe('production origins', () => {
  it('refuses a plain-http public origin in production', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', WEB_ORIGIN: 'http://studio.example.com' }),
    ).toThrow(/must use https in production/);
  });

  it('allows https and localhost in production', () => {
    expect(
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        WEB_ORIGIN: 'https://studio.example.com,http://localhost:3100',
      }).WEB_ORIGIN,
    ).toEqual(['https://studio.example.com', 'http://localhost:3100']);
  });

  it('trusts the deployment hostnames Vercel injects', () => {
    const env = loadEnv({
      ...base,
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://studio.example.com',
      VERCEL_URL: 'nova-abc123.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'nova.vercel.app',
    });
    expect(env.WEB_ORIGIN).toEqual([
      'https://studio.example.com',
      'https://nova-abc123.vercel.app',
      'https://nova.vercel.app',
    ]);
  });
});
