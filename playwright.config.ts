import { defineConfig } from '@playwright/test';

const appBaseUrl = process.env.APP_BASE_URL ?? 'http://127.0.0.1:4100';
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: isCi ? 1 : 5,
  expect: {
    timeout: 15_000,
  },
  reporter: isCi
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: appBaseUrl,
    browserName: 'chromium',
    headless: true,
    viewport: {
      width: 1440,
      height: 960,
    },
    testIdAttribute: 'data-testid',
    trace: 'on',
    screenshot: 'on',
    video: 'on',
  },
  webServer: {
    command: 'npm run dev:e2e',
    url: appBaseUrl,
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
});
