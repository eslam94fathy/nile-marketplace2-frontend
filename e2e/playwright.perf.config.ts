import { defineConfig } from '@playwright/test';
import { appUrl } from './apps';

// Performance run (T-I3): Lighthouse CI against the storefront's production build and the real backend.
// Prerequisites as for E2E (`npm run build`, the backend with seed data and Mailpit, the E2E_* settings).
// `npm run perf`; nightly in .github/workflows/perf.yml.
export default defineConfig({
  testDir: './perf',
  outputDir: '../test-results',
  workers: 1,
  reporter: 'list',
  webServer: {
    command: 'npm run start -w @nile/storefront',
    url: appUrl('storefront'),
    reuseExistingServer: false,
    timeout: 60_000,
    env: { SESSION_COOKIE_SECURE: 'true' },
  },
});
