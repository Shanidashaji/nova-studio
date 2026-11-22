import { defineConfig } from 'vitest/config';

// Integration tests exercise the compiled API (dist/) against a real PostgreSQL test database.
// Running against compiled output keeps NestJS's decorator metadata exactly as in production.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
