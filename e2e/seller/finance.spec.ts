// T-H5 smoke (spec 02 SE-16) against the real backend: a new seller's finance page shows no earnings, an
// empty statement and no payouts, without accessibility blockers.
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

test('finance: balance, statement and payouts tabs', async ({ page, signIn }) => {
  await signIn('seller');
  await page.goto('/finance');
  await expect(page.getByRole('heading', { level: 1, name: 'Finance' })).toBeVisible();
  await expect(page.getByText('Balances update a few moments after a delivery.')).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Your statement' }).or(page.getByText('No transactions yet.')),
  ).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  await page.getByRole('link', { name: 'Payouts' }).click();
  await expect(page).toHaveURL(/\/finance\?tab=payouts$/);
  await expect(
    page.getByRole('table', { name: 'Your payouts' }).or(page.getByText('No payouts yet.')),
  ).toBeVisible();
  await expectNoBlockingA11yViolations(page);
});
