// T-O4 (spec 03 AD-35, AD-37, TM9-Q4): a seller's coupon (through the API) found from the seller's filter,
// read-only on AD-37, blocked with a reason (turned off at once), then unblocked; the audit log records both.
import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

test('block a seller coupon, then unblock it', async ({ page, signIn, accounts, seller }) => {
  await signIn('admin');
  const code = `SBLK-${randomUUID().slice(0, 8).toUpperCase()}`;
  const coupon = expectData(
    await accounts.backend.request('POST', '/api/v1/seller/coupons', {
      token: seller.accessToken,
      body: {
        scope: 'seller',
        code,
        discountType: 'percent',
        discountValue: '0.1000',
        minItemsSubtotal: '0.00',
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        perCustomerLimit: 1,
      } satisfies Schema<'SellerCreateCouponDto'>,
    }),
    201,
  ) as Schema<'CouponDto'>;

  await page.goto(`/coupons?seller=${seller.sellerId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Coupons' })).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('link', { name: code }).click();
  await expect(page).toHaveURL(`/coupons/${coupon.id}`);
  await expect(
    page.getByText('Seller coupons are managed by their seller. Nile can only block them.'),
  ).toBeVisible();

  const reason = `Misleading code ${code}`;
  await page.getByRole('button', { name: 'Block', exact: true }).click();
  const block = page.getByRole('dialog', { name: 'Block coupon' });
  await block.getByRole('textbox', { name: /^Reason/ }).fill(reason);
  await block.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(page.getByText(`${code} is blocked.`, { exact: true })).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  await page.getByRole('button', { name: 'Unblock' }).click();
  await page.getByRole('dialog', { name: 'Unblock coupon' }).getByRole('button', { name: 'Unblock' }).click();
  await expect(page.getByText(`${code} is no longer blocked.`, { exact: true })).toBeVisible();
});
