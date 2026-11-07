import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the static export in out/ (run `pnpm build` first),
// in Chromium with an iPhone-sized touch viewport. No Firebase config is set, so the
// app uses its local demo backend.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  outputDir: 'test-results/artifacts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  snapshotPathTemplate: 'tests/e2e/__screenshots__/{arg}{ext}',
  projects: [
    {
      name: 'iphone',
      testMatch: /reader\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        baseURL: 'http://localhost:4173',
        trace: 'retain-on-failure',
      },
    },
    {
      name: 'qa',
      testMatch: /(responsive|rotation|interactions|motion-quality|loading|reading|visual|latency)\.spec\.ts/,
      use: {
        browserName: 'chromium',
        baseURL: 'http://localhost:4173',
        trace: 'retain-on-failure',
      },
    },
    {
      name: 'continuity',
      testMatch: /continuity\.spec\.ts/,
      use: {
        browserName: 'chromium',
        baseURL: 'http://localhost:4173',
        trace: 'retain-on-failure',
      },
    },
    {
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      dependencies: ['iphone', 'qa'],
      use: {
        browserName: 'chromium',
        baseURL: 'http://localhost:4173',
        trace: 'retain-on-failure',
      },
    },
  ],
  webServer: {
    command: 'node scripts/serve.mjs out',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
