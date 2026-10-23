// T-H1 journey (workflow S-1, spec 02 SE-07) against the real backend: an admin rejects the application
// (seeded through the API), the seller sees the reason, updates the profile and re-applies.
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

const REASON = 'Pickup address is incomplete';

test('rejected → edit profile → re-apply → waiting for approval', async ({ page, accounts, admin }) => {
  const seller = await accounts.seller({ approved: false });
  expectData(
    await accounts.backend.request('POST', `/api/v1/admin/sellers/${seller.sellerId}/reject`, {
      token: admin.accessToken,
      body: { reason: REASON } satisfies Schema<'SellerDecisionDto'>,
    }),
    200,
  );

  await page.goto('/login?returnTo=%2Fprofile');
  await page.getByLabel(/^Email/).fill(seller.email);
  await page.getByLabel(/^Password/).fill(seller.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  await expect(page.getByText(`Your application was rejected: ${REASON}.`)).toBeVisible();
  await expect(page.getByText('Rejected', { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Nile's commission: 10%")).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await page.getByLabel(/^Landmark/).fill('Opposite the metro station');
  await save.click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  await expect(save).toBeDisabled();

  await page.getByRole('button', { name: 'Re-apply' }).click();
  const dialog = page.getByRole('dialog', { name: 'Re-apply' });
  await expect(dialog).toContainText('Make sure your details are up to date.');
  await expectNoBlockingA11yViolations(page);
  await dialog.getByRole('button', { name: 'Send for review' }).click();

  await expect(page.getByText('Your application was sent for review.')).toBeVisible();
  await expect(page.getByText('Waiting for approval', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Re-apply' })).toHaveCount(0);

  // The backend agrees, and kept the edit.
  const profile = expectData(
    await accounts.backend.request('GET', '/api/v1/seller/profile', { token: seller.accessToken }),
    200,
  ) as Schema<'SellerProfileDto'>;
  expect(profile.status).toBe('pending_approval');
  expect(profile.pickupAddress.landmark).toBe('Opposite the metro station');
});

test('overview: a seller waiting for approval sees the checklist and a disabled "Add product"', async ({
  page,
  accounts,
}) => {
  const seller = await accounts.seller({ approved: false });
  await page.goto('/login');
  await page.getByLabel(/^Email/).fill(seller.email);
  await page.getByLabel(/^Password/).fill(seller.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('list', { name: 'Application progress' })).toContainText(
    'Waiting for admin review',
  );
  await expect(page.getByRole('button', { name: 'Add product' })).toBeDisabled();
  await expectNoBlockingA11yViolations(page);
});
