import { execSync } from 'node:child_process';
import path from 'node:path';
import { config } from 'dotenv';

/**
 * Prepares the integration-test database once per run: applies migrations and loads the
 * demonstration seed. Uses TEST_DATABASE_URL, never DATABASE_URL.
 */
export default function setup() {
  config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see .env.example).');

  const env = {
    ...process.env,
    DATABASE_URL: url,
    NODE_ENV: 'test',
    SEED_ADMIN_EMAIL: 'admin@test.local',
    SEED_ADMIN_PASSWORD: 'test-admin-password-123',
  };
  const cwd = path.resolve(__dirname, '../../../packages/db');
  execSync('pnpm exec prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  execSync('pnpm exec tsx src/seed/index.ts', { cwd, env, stdio: 'pipe' });
}
