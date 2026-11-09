import { defineConfig, devices } from '@playwright/test';

// Run via scripts/e2e.sh, which starts a private backend + frontend and sets E2E_* env vars.
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: process.env.E2E_APP_URL ?? 'http://127.0.0.1:5700',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
