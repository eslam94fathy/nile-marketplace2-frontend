// T-D7 against the real backend: change the password on the security page, stay signed in, then the old
// password no longer works and the new one does.
import { randomPassword } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

// Labels of required fields end with a screen-reader-only "(required)", hence the anchored patterns.

test('change password → still signed in → old password refused, new one accepted', async ({
  page,
  customer: account,
}) => {
  // A customer of its own (not the worker's shared one from signIn): its password changes here.
  const newPassword = randomPassword();
  await page.goto('/login?returnTo=%2Faccount%2Fsecurity');
  await page.getByLabel(/^Email/).fill(account.email);
  await page.getByLabel(/^Password/).fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Security' })).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await page.getByLabel(/^Current password/).fill(account.password);
  await page.getByLabel(/^New password/).fill(newPassword);
  await page.getByLabel(/^Confirm new password/).fill(newPassword);
  await page.getByRole('button', { name: 'Change password' }).click();
  // The toast also has a screen-reader copy, hence first().
  await expect(page.getByText('Password changed.').first()).toBeVisible();

  // This session stays signed in.
  await page.reload();
  await expect(page).toHaveURL(/\/account\/security$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Security' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/login');
  await page.getByLabel(/^Email/).fill(account.email);
  await page.getByLabel(/^Password/).fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('Email or password is incorrect.');

  await page.getByLabel(/^Password/).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: /^Hi, / })).toBeVisible();
});

test('a wrong current password is shown on its field', async ({ page, customer }) => {
  await page.goto('/login?returnTo=%2Faccount%2Fsecurity');
  await page.getByLabel(/^Email/).fill(customer.email);
  await page.getByLabel(/^Password/).fill(customer.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
  await page.getByLabel(/^Current password/).fill('not-my-password');
  await page.getByLabel(/^New password/).fill('another password');
  await page.getByLabel(/^Confirm new password/).fill('another password');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Current password is incorrect.')).toBeVisible();
});
