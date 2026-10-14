// T-D4 journeys (workflow C-2) against the real backend: registration with the emailed code, password
// reset, sign-in and sign-out through the screens, plus axe on every sign-in screen.
import { otpFromEmail, randomPassword, uniqueEmail } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

// Labels of required fields end with a screen-reader-only "(required)", hence the anchored patterns.

const PHONE_DIGITS = '1012345678';

test('register → code from Mailpit → verify → signed in, back on the page the visit started from', async ({
  page,
  accounts,
}) => {
  const email = uniqueEmail('register');
  const password = ` ${randomPassword()} `; // spaces kept: passwords are never trimmed
  await page.goto('/register?returnTo=%2Fsearch%3Fq%3Dphone');
  await expectNoBlockingA11yViolations(page);

  await page.getByLabel('First name').fill('Mona');
  await page.getByLabel('Last name').fill('Ali');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mobile phone').fill(PHONE_DIGITS);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  const text = await accounts.mailpit.awaitEmail(email, 'verification', () =>
    page.getByRole('button', { name: 'Create account' }).click(),
  );

  await expect(page).toHaveURL(/\/verify-email\?email=.+&returnTo=%2Fsearch%3Fq%3Dphone$/); // `sent` dropped
  await expect(page.getByRole('button', { name: /Resend code in \d+ s/ })).toBeDisabled();
  await expectNoBlockingA11yViolations(page);
  await page.getByLabel('Code').fill(otpFromEmail(text));
  await page.getByRole('button', { name: 'Verify' }).click();

  await expect(page).toHaveURL(/\/search\?q=phone$/);
  await expect(page.getByRole('button', { name: 'Hi, Mona' })).toBeVisible();

  // Sign out from the header menu, then sign in again with the untrimmed password.
  await page.getByRole('button', { name: 'Hi, Mona' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await page.getByRole('link', { name: 'Sign in' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Hi, Mona' })).toBeVisible();
});

test('forgot password → code → reset → sign in with the new password', async ({
  page,
  accounts,
  customer,
}) => {
  const newPassword = randomPassword();
  await page.goto(`/login?email=${encodeURIComponent(customer.email)}`);
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByLabel('Email')).toHaveValue(customer.email);
  await expectNoBlockingA11yViolations(page);

  const text = await accounts.mailpit.awaitEmail(customer.email, 'passwordReset', () =>
    page.getByRole('button', { name: 'Send code' }).click(),
  );
  await expect(page.getByRole('status')).toHaveText(
    'If an active account uses this email, we sent a reset code.',
  );
  await expectNoBlockingA11yViolations(page);
  await page.getByLabel('Code').fill(otpFromEmail(text));
  await page.getByLabel(/^New password/).fill(newPassword);
  await page.getByLabel('Confirm new password').fill(newPassword);
  await page.getByRole('button', { name: 'Reset password' }).click();

  await expect(page).toHaveURL(/\/login\?notice=password-reset&email=/);
  await expect(page.getByRole('status')).toHaveText('Your password was changed. Please sign in.');
  await page.getByLabel(/^Password/).fill(customer.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Scoped to the form: Next.js's route announcer is an `alert` too.
  await expect(page.locator('form').getByRole('alert')).toContainText('Email or password is incorrect.');

  await page.getByLabel(/^Password/).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: /^Hi, / })).toBeVisible();
});

test('forgot password for an unknown email looks exactly the same (no enumeration)', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(uniqueEmail('nobody'));
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'If an active account uses this email, we sent a reset code.',
  );
});
