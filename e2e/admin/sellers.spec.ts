// T-H7 journey (workflow AD-2, spec 03 AD-04, AD-05) against the real backend: a seller registered and
// verified through the API waits for approval; the admin finds them on the dashboard, approves them and sets
// their commission; the backend agrees.
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

test('pending seller → approve → commission 12.5 %', async ({ page, signIn, accounts }) => {
  test.slow();
  const seller = await accounts.seller({ approved: false });
  const admin = await signIn('admin');
  const profile = expectData(
    await accounts.backend.request('GET', `/api/v1/admin/sellers/${seller.sellerId}`, {
      token: admin.accessToken,
    }),
    200,
  ) as Schema<'AdminSellerDetailDto'>;

  await page.goto(`/sellers/${seller.sellerId}`);
  await expect(page.getByRole('heading', { level: 1, name: profile.businessName })).toBeVisible();
  await expect(page.getByText('Email verified')).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('dialog', { name: 'Approve' }).getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(`${profile.businessName} is approved.`, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suspend' })).toBeVisible();

  const rate = page.getByLabel(/^Commission rate/);
  await rate.fill('12.5');
  await page.getByRole('button', { name: 'Save rate' }).click();
  await expect(page.getByText('Commission set to 12.5%.', { exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Commission changes, newest first' })).toContainText('12.5%');

  const after = expectData(
    await accounts.backend.request('GET', `/api/v1/admin/sellers/${seller.sellerId}`, {
      token: admin.accessToken,
    }),
    200,
  ) as Schema<'AdminSellerDetailDto'>;
  expect(after.status).toBe('approved');
  expect(after.commissionRate).toBe('0.1250');
});

test('sellers list and dashboard queue render without accessibility blockers', async ({ page, signIn }) => {
  await signIn('admin');
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Sellers waiting for approval' })).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await page.goto('/sellers?status=all');
  await expect(page.getByRole('heading', { level: 1, name: 'Sellers' })).toBeVisible();
  await expectNoBlockingA11yViolations(page);
});
