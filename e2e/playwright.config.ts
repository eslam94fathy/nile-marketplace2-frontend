import { defineConfig, devices } from '@playwright/test';
import { appUrl, E2E_APP_NAMES } from './apps';

// E2E against production builds of the four apps and the real backend (architecture §8, design 01 §12.3).
// Prerequisites: `npm run build`, the backend stack with Mailpit, and the E2E_* settings (e2eEnv()).
// One project per app (tests in e2e/<app>/), plus `fixtures`, which checks the per-role account fixtures.
// Phase d adds browser-login fixtures and the CI e2e-smoke job; nightly adds WebKit and a mobile viewport.
const isCi = process.env.CI === 'true';

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results',
  fullyParallel: true,
  // Four production servers and the browsers share one machine; more workers starved axe runs (T-C2).
  workers: 2,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
  },
  projects: [
    ...E2E_APP_NAMES.map((app) => ({ name: app, testDir: `./${app}`, use: { baseURL: appUrl(app) } })),
    { name: 'fixtures', testDir: './fixtures' },
    // Cross-role flows (T-O4, TO-Q4): several apps in one test, so absolute URLs (`appUrl`) and no baseURL.
    { name: 'flows', testDir: './flows' },
  ],
  webServer: E2E_APP_NAMES.map((app) => ({
    command: `npm run start -w @nile/${app}`,
    url: appUrl(app),
    // Never reuse: a server left running would serve an older build and the run would test stale code.
    reuseExistingServer: false,
    timeout: 60_000,
    // Production mode refuses insecure session cookies (design 01 §3.1, DQ-3); browsers accept Secure
    // cookies on http://localhost, so the production setting works here.
    env: { SESSION_COOKIE_SECURE: 'true' },
  })),
});
