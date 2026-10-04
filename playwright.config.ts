import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: process.env.BATTLESHIPS_TEST_OUTPUT ?? 'test-results/current',
  fullyParallel: false,
  workers: 1,
  // Windows WebKit takes ~2s per input across four isolated browser contexts.
  timeout: 240_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: process.env.BATTLESHIPS_TEST_URL ?? 'http://127.0.0.1:8788',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'phone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'webkit-phone', use: { ...devices['iPhone 13'] } },
  ],
});
