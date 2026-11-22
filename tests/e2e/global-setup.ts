import { execSync } from 'node:child_process';
import path from 'node:path';

/** Re-seeds the demo database so journeys run against a known studio state. */
export default function globalSetup() {
  if (process.env.E2E_SKIP_SEED === '1') return;
  execSync('pnpm exec tsx src/seed/index.ts', {
    cwd: path.resolve(__dirname, '../../packages/db'),
    stdio: 'pipe',
  });
}
