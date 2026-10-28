// T-H10 journey (workflow AD-5, spec 03 AD-15, AD-16) against the real backend (PAYMENT_GATEWAY=fake): a
// card order is left unpaid until its window expires, then Kashier reports it paid; the backend flags a
// "paid after the payment window" refund, which the admin records with Kashier's reference.
// Needs NILE_BACKEND_DIR (the backend checkout, built) to send the webhook, and KASHIER_PAYMENT_TTL_MINUTES=1
// in the backend's .env; skipped otherwise (design 01 R-33).
import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { backendDir, sendKashierWebhook } from '../fixtures/kashier';
import { placeOrder } from '../fixtures/orders';

/** Longest payment window the test waits out (backend KASHIER_PAYMENT_TTL_MINUTES=1). */
const MAX_PAYMENT_WINDOW_MS = 2 * 60_000;
/** The expiry job and the webhook worker run on intervals: allow them this much after the window. */
const JOB_SLACK_MS = 2 * 60_000;

test('late Kashier payment → refund to record → recorded', async ({ page, signIn, accounts, customer }) => {
  // Release 2 backend refunds a late Kashier payment automatically (backend spec 10 §8: pending_auto →
  // succeeded); `pending_manual` is now only the fallback. Rewritten with the R2 refund queue in T-M8.
  test.skip(true, 'R2 refunds late Kashier payments automatically: rewritten in T-M8');
  const dir = backendDir();
  test.skip(dir === null, 'set NILE_BACKEND_DIR to the backend checkout to send Kashier webhooks');
  // The test outlives one access token (2-minute tokens in E2E): each call asks for a current one.
  const { backend } = accounts;
  const order = await placeOrder(backend, customer.accessToken, 'kashier');
  const paymentWindow = Date.parse(order.paymentExpiresAt ?? '') - Date.parse(order.createdAt);
  test.skip(
    !(paymentWindow <= MAX_PAYMENT_WINDOW_MS),
    `payment window is ${Math.round(paymentWindow / 60_000)} min; set KASHIER_PAYMENT_TTL_MINUTES=1 in the backend`,
  );
  test.setTimeout(paymentWindow + 2 * JOB_SLACK_MS + 60_000);

  const readOrder = async () =>
    expectData(
      await backend.request('GET', `/api/v1/admin/orders/${order.id}`, {
        token: (await accounts.admin()).accessToken,
      }),
      200,
    ) as Schema<'AdminOrderDetailDto'>;
  await expect
    .poll(async () => (await readOrder()).status, {
      timeout: paymentWindow + JOB_SLACK_MS,
      intervals: [5_000],
    })
    .toBe('cancelled');
  await sendKashierWebhook(dir ?? '', order.id, 'paid');

  const findRefund = async () => {
    const refunds = expectData(
      await backend.request(
        'GET',
        '/api/v1/admin/payments/refunds?status[eq]=pending_manual&sort=-createdAt&limit=100',
        { token: (await accounts.admin()).accessToken },
      ),
      200,
    ) as Schema<'RefundDto'>[];
    return refunds.find((refund) => refund.orderId === order.id);
  };
  await expect
    .poll(async () => (await findRefund())?.reason, { timeout: JOB_SLACK_MS })
    .toBe('late_payment_after_expiry');

  await signIn('admin');
  await page.goto('/refunds?reason=late_payment_after_expiry');
  await expect(page.getByRole('heading', { level: 1, name: 'Refunds' })).toBeVisible();
  // UUID v7 ids share their first characters when created close together: match the link, not the short id.
  const row = page.getByRole('row').filter({ has: page.locator(`a[href="/orders/${order.id}"]`) });
  await expect(row).toContainText('Paid after the payment window');
  await expectNoBlockingA11yViolations(page);
  await row.getByRole('button', { name: /^Record refund of / }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('in the Kashier dashboard first');
  const reference = `KSH-E2E-${randomUUID().slice(0, 8)}`;
  await dialog.getByLabel(/^Kashier's refund reference/).fill(reference);
  await expectNoBlockingA11yViolations(page);
  await dialog.getByRole('button', { name: 'Record refund' }).click();
  await expect(page.getByText(/^Refund of .+ recorded\.$/)).toBeVisible();

  await page.goto('/refunds?status=recorded');
  await expect(page.getByRole('row').filter({ hasText: reference })).toContainText('by you');

  await page.goto(`/orders/${order.id}`);
  await expect(page.getByRole('heading', { level: 1, name: `Order ${order.orderNumber}` })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Refunds of this order' })).toContainText(reference);
  await expectNoBlockingA11yViolations(page);
});
