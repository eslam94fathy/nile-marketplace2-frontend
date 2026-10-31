// T-O4 (spec 03 AD-02, TM1): the "Today" figures with their time and the 30-day sales table; "Refresh" reads
// them again (no polling, AD-Q-16) and the page shows what the API returns. The backend caches the figures
// (DASHBOARD_CACHE_TTL_SECONDS), so a new order can't be expected in them at once.
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import type { Page } from '@playwright/test';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { currentToken } from '../fixtures/sessions';

const figure = (page: Page, label: string) =>
  page
    .locator('dl > div')
    .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
    .locator('dd');

test('today figures, sales table and Refresh', async ({ page, context, signIn, accounts }) => {
  await signIn('admin');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByText(/^Figures from /)).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Sales per day, last 30 days, most recent first' }),
  ).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  const refreshed = page.waitForResponse(
    (response) => response.url().endsWith('/api/bff/admin/dashboard') && response.ok(),
  );
  await page.getByRole('button', { name: 'Refresh the figures' }).click();
  await refreshed;

  const figures = expectData(
    await accounts.backend.request('GET', '/api/v1/admin/dashboard', {
      token: await currentToken(context, 'admin'),
    }),
    200,
  ) as Schema<'DashboardDto'>;
  await expect(figure(page, 'Placed today')).toHaveText(String(figures.orders.placedToday));
});
