// T-O4 (spec 02 SE-21…SE-23, TL5): an approved seller creates a 10 % coupon on all their products with the
// form's defaults (starts now, minimum 0.00, once per customer), finds it in the list, then turns it off on SE-23.
import { randomUUID } from 'node:crypto';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

/** A Cairo `datetime-local` value far enough ahead for any run. */
const ENDS_AT = '2030-12-31T23:59';

test('create a coupon, find it in the list, turn it off', async ({ page, signIn }) => {
  await signIn('seller');
  const code = `SELL-${randomUUID().slice(0, 8).toUpperCase()}`;

  await page.goto('/coupons');
  await expect(page.getByRole('heading', { level: 1, name: 'Coupons' })).toBeVisible();
  // The header's link (the empty state has another for a seller without coupons).
  await page.getByRole('link', { name: 'New coupon' }).first().click();
  await expect(page).toHaveURL(/\/coupons\/new$/);
  await page.getByRole('textbox', { name: /^Code/ }).fill(code.toLowerCase());
  await page.getByRole('textbox', { name: /^Discount \(%\)/ }).fill('10');
  await page.getByLabel(/^Ends/).fill(ENDS_AT);
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('button', { name: 'Create coupon' }).click();
  await expect(page.getByText('Coupon created.', { exact: true })).toBeVisible();

  await page.goto('/coupons?status=active');
  const row = page.getByRole('row').filter({ hasText: code });
  await expect(row).toBeVisible();
  await expect(row).toContainText('10 %');
  await expect(row).toContainText('0 of unlimited');
  await expectNoBlockingA11yViolations(page);

  await row.getByRole('link', { name: code }).click();
  await expect(page.getByRole('heading', { level: 1, name: code })).toBeVisible();
  await page.getByRole('switch', { name: 'Active' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Coupon saved.', { exact: true })).toBeVisible();

  await page.goto('/coupons?status=inactive');
  await expect(page.getByRole('row').filter({ hasText: code })).toBeVisible();
});
