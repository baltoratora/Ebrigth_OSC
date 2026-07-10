import { defineConfig, devices } from '@playwright/test';
import { config as dotenv } from 'dotenv';

dotenv({ path: '.env.test' });

const PORT = 3001;

// Resolve the URL tests should hit. We accept both PLAYWRIGHT_BASE_URL
// (Playwright's own convention) and BASE_URL (used by the staging-deploy
// workflow). When either points at a non-localhost host we are running
// against a real deployment and must NOT spawn a local `next dev` server.
const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? process.env.BASE_URL;
const useRemoteServer = !!remoteBaseUrl && !/localhost/.test(remoteBaseUrl);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // tests share a DB
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list']],
  use: {
    baseURL: remoteBaseUrl ?? `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Only spawn a local Next.js dev server when we are NOT pointing at a
  // remote deployment. Otherwise the deploy-time smoke run on GitHub
  // Actions tries to start `next dev` without a DATABASE_URL and floods
  // the log with PrismaClientInitializationError noise.
  webServer: useRemoteServer
    ? undefined
    : {
        command: `next dev -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        env: {
          DATABASE_URL: process.env.DATABASE_URL ?? '',
          NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? '',
          NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? '',
        },
        timeout: 120_000,
      },
});
