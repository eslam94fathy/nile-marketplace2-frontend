// T-D5 journey (workflow S-1) against the real backend: a seller registers with a pickup address, verifies
// the emailed code and lands on the overview, which shows that the account waits for approval.
import { otpFromEmail, randomPassword, randomPhone, uniqueEmail } from '@nile/test-utils/e2e';
import { randomUUID } from 'node:crypto';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

// Labels of required fields end with a screen-reader-only "(required)", hence the anchored patterns.

test('register → code from Mailpit → verify → overview with "waiting for approval"', async ({
  page,
  accounts,
}) => {
  const email = uniqueEmail('seller-register');
  const businessName = `E2E Shop ${randomUUID().slice(0, 8)}`;
  const password = randomPassword();

  await page.goto('/register');
  await expectNoBlockingA11yViolations(page);
  await page.getByLabel(/^Business name/).fill(businessName);
  await page.getByLabel(/^Contact phone/).fill(randomPhone().slice('+20'.length));
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByLabel(/^Confirm password/).fill(password);
  await page.getByRole('combobox', { name: /^Governorate/ }).click();
  await page.getByRole('option').first().click();
  await page.getByLabel(/^City/).fill('Cairo');
  await page.getByLabel(/^Area/).fill('Zamalek');
  await page.getByLabel(/^Street/).fill('26th of July St');
  await page.getByLabel(/^Building/).fill('12');

  const text = await accounts.mailpit.awaitEmail(email, 'verification', () =>
    page.getByRole('button', { name: 'Create seller account' }).click(),
  );
  await expect(
    page.getByText('After verifying your email, our team will review your application.'),
  ).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await page.getByLabel(/^Code/).fill(otpFromEmail(text));
  await page.getByRole('button', { name: 'Verify' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(businessName)).toBeVisible();
  await expect(page.getByText('Waiting for approval', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Your account is waiting for approval.');
  await expectNoBlockingA11yViolations(page);
});

test('a customer account is pointed to the store site', async ({ page, customer }) => {
  await page.goto('/login');
  await page.getByLabel(/^Email/).fill(customer.email);
  await page.getByLabel(/^Password/).fill(customer.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText(
    'This is a customer account. Please use the store site.',
  );
  await expect(page).toHaveURL(/\/login$/);
});
