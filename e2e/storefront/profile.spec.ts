// T-G1 against the real backend: a customer edits their last name and phone on /account; only those fields
// are sent, the change survives a reload and is what `GET /me` returns; the email stays read-only.
import type { Schema } from '@nile/api';
import type { Page } from '@playwright/test';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

async function signInThroughForm(page: Page, email: string, password: string, returnTo: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('edit profile: only changed fields are sent and saved', async ({ page, accounts, customer }) => {
  await signInThroughForm(page, customer.email, customer.password, '/account');
  await expect(page.getByRole('heading', { level: 1, name: 'Your account' })).toBeVisible();
  await expect(page.getByText(customer.email)).toBeVisible();
  await expect(page.getByText("Email can't be changed.")).toBeVisible();
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await expectNoBlockingA11yViolations(page);

  const patches: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().endsWith('/api/bff/me')) patches.push(request.url());
  });
  await page.getByRole('textbox', { name: /^Last name/ }).fill('Samir');
  await page.getByRole('textbox', { name: /^Mobile phone/ }).fill('1101234567');
  await save.click();
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible();
  await expect(save).toBeDisabled();
  expect(patches).toHaveLength(1);

  await page.reload();
  await expect(page.getByRole('textbox', { name: /^Last name/ })).toHaveValue('Samir');
  await expect(page.getByRole('textbox', { name: /^Mobile phone/ })).toHaveValue('1101234567');

  const me = (await accounts.backend.request('GET', '/api/v1/me', { token: customer.accessToken })).body as {
    data: Schema<'CustomerProfileDto'>;
  };
  expect(me.data.lastName).toBe('Samir');
  expect(me.data.phone).toBe('+201101234567');
  expect(me.data.email).toBe(customer.email);
});
