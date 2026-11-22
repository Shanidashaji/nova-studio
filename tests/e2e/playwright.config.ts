import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

/**
 * End-to-end journeys against a running NOVA (web on :3100, API on :4000).
 * Uses the installed Google Chrome (`channel: 'chrome'`), so no browser download is needed.
 * The global setup re-seeds the demo database so every run starts from the same studio.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1600, height: 1000 },
        storageState: '.auth/admin.json',
      },
      dependencies: ['setup'],
      testIgnore: /mobile\.spec\.ts|auth\.spec\.ts/,
    },
    {
      name: 'auth',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
      testMatch: /auth\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], channel: 'chrome', storageState: '.auth/admin.json' },
      dependencies: ['setup'],
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
