// T-O4 (spec 03 AD-24, TM2, AD-Q-10): a customer found by its email prefix, suspended with a reason (signed out
// everywhere, can't sign in), then reactivated (can sign in again).
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

test('suspend a customer, then reactivate', async ({ page, signIn, accounts, customer }) => {
  await signIn('admin');
  const signInStatus = async () =>
    (
      await accounts.backend.request('POST', '/api/v1/auth/login', {
        body: { email: customer.email, password: customer.password },
      })
    ).status;

  await page.goto(`/users?email=${encodeURIComponent(customer.email)}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: customer.email });
  await expect(row).toContainText('Active');
  await expectNoBlockingA11yViolations(page);

  await row.getByRole('button', { name: `Suspend ${customer.email}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Suspend customer' });
  await expect(dialog).toContainText("They are signed out everywhere and can't sign in.");
  await dialog.getByRole('textbox', { name: /^Reason/ }).fill('Repeated fake orders.');
  await dialog.getByRole('button', { name: 'Suspend' }).click();
  await expect(page.getByText(`${customer.email} was suspended.`, { exact: true })).toBeVisible();
  await expect(row).toContainText('Suspended');
  expect(await signInStatus()).not.toBe(200);

  await row.getByRole('button', { name: `Reactivate ${customer.email}` }).click();
  await expect(page.getByText(`${customer.email} can sign in again.`, { exact: true })).toBeVisible();
  await expect(row).toContainText('Active');
  expect(await signInStatus()).toBe(200);
});
