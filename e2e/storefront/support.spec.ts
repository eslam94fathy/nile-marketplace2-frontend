// T-K7 journey (spec 01 SF-29…SF-31) against the real backend: open a ticket with a photo, the thread, a reply
// from Nile Support (admin, through the API) arriving live, the customer's answer, and the unread mark.
import { randomUUID } from 'node:crypto';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { solidPng } from '../fixtures/images';

test('open a ticket, get a reply from Nile Support, answer it', async ({ page, signIn, accounts, admin }) => {
  test.slow();
  await signIn('storefront');
  const { backend } = accounts;
  const subject = `Parcel question ${randomUUID().slice(0, 8)}`;

  await page.goto('/account/support');
  await expect(page.getByRole('heading', { level: 1, name: 'Help & support' })).toBeVisible();
  await page.getByRole('link', { name: 'New ticket' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New ticket' })).toBeVisible();
  await page.getByRole('combobox', { name: /^Category/ }).click();
  await page.getByRole('option', { name: 'Delivery' }).click();
  await page.getByRole('textbox', { name: /^Subject/ }).fill(subject);
  await page.getByRole('textbox', { name: /^Message/ }).fill('When will my parcel arrive?');
  await page
    .getByLabel('Photos')
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: solidPng() });
  await expect(page.getByText('Ready', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('button', { name: 'Send ticket' }).click();

  await expect(page).toHaveURL(/\/account\/support\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: subject })).toBeVisible();
  const messages = page.getByRole('region', { name: 'Messages' });
  await expect(messages.getByText('When will my parcel arrive?')).toBeVisible();
  await expect(messages.getByRole('img', { name: /^Photo 1 of 1 from You$/ })).toBeVisible();
  await expect(page.getByText('Sent', { exact: true })).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  // Nile Support answers (admin API); the open thread shows it without a reload.
  const ticketId = page.url().split('/').at(-1) ?? '';
  const reply = await backend.request('POST', `/api/v1/admin/support/tickets/${ticketId}/messages`, {
    token: admin.accessToken,
    idempotencyKey: randomUUID(),
    body: { body: 'It is out for delivery today.' },
  });
  expect(reply.status).toBe(201);
  await expect(messages.getByText('It is out for delivery today.')).toBeVisible({ timeout: 15_000 });
  await expect(messages.getByText('Nile Support').first()).toBeVisible();
  await expect(page.getByText('Support replied', { exact: true })).toBeVisible({ timeout: 15_000 });

  const box = page.getByRole('textbox', { name: /^Your message/ });
  await box.fill('Thank you!');
  await box.press('Control+Enter');
  await expect(messages.getByText('Thank you!')).toBeVisible();
  await expect(box).toHaveValue('');

  // Read while open: the list shows no "New reply" for it.
  await page.goto('/account/support');
  const row = page.getByRole('article').filter({ hasText: subject });
  await expect(row).toBeVisible();
  await expect(row.getByText('New reply')).toHaveCount(0);
  await expectNoBlockingA11yViolations(page);
});
