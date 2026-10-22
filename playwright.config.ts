import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the static export in out/ (run `pnpm build` first),
// in Chromium with an iPhone-sized touch viewport. No Firebase config is set, so the
// app uses its local demo backend.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve.mjs out',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
