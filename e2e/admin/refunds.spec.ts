// T-M8 journey (workflow AD-5, spec 03 AD-15, AD-16, AD-34) against the real backend (PAYMENT_GATEWAY=fake): a
// card order is left unpaid until its window expires, then Kashier reports it paid; the Release 2 backend flags a
// "paid after the payment window" refund and its job sends it to the (fake) gateway (backend spec 10 §8:
// pending_auto → succeeded). Should the job hand it back (`pending_manual`), the admin records it on AD-34.
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
/** The refund job spaces refunds of one payment by 2 minutes (backend K-11) and runs on its own interval. */
const REFUND_JOB_SLACK_MS = 4 * 60_000;
/** Where a refund ends without an admin, or where it waits for one. */
const SETTLED_OR_MANUAL: readonly Schema<'RefundDto'>['status'][] = ['succeeded', 'pending_manual'];

test('late Kashier payment → automatic refund (or recorded on AD-34)', async ({
  page,
  signIn,
  accounts,
  customer,
}) => {
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
  test.setTimeout(paymentWindow + 2 * JOB_SLACK_MS + REFUND_JOB_SLACK_MS + 90_000);

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
      await backend.request('GET', '/api/v1/admin/payments/refunds?sort=-createdAt&limit=100', {
        token: (await accounts.admin()).accessToken,
      }),
      200,
    ) as Schema<'RefundDto'>[];
    return refunds.find((refund) => refund.orderId === order.id);
  };
  await expect
    .poll(async () => (await findRefund())?.reason, { timeout: JOB_SLACK_MS })
    .toBe('late_payment_after_expiry');
  await expect
    .poll(async () => SETTLED_OR_MANUAL.includes((await findRefund())?.status ?? 'pending_auto'), {
      timeout: REFUND_JOB_SLACK_MS,
      intervals: [5_000],
    })
    .toBe(true);
  const refund = await findRefund();
  if (refund === undefined) throw new Error('refund disappeared');

  await signIn('admin');
  await page.goto('/refunds?status=all&reason=late_payment_after_expiry');
  await expect(page.getByRole('heading', { level: 1, name: 'Refunds' })).toBeVisible();
  // UUID v7 ids share their first characters when created close together: match the link, not the short id.
  const row = page.getByRole('row').filter({ has: page.locator(`a[href="/refunds/${refund.id}"]`) });
  await expect(row).toContainText('Paid after the payment window');
  await expectNoBlockingA11yViolations(page);
  await row.locator(`a[href="/refunds/${refund.id}"]`).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Refund of / })).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  if (refund.status === 'succeeded') {
    await expect(page.getByLabel('Refund details')).toContainText('Refunded automatically');
    await expect(page.getByRole('group', { name: 'Refund actions' })).toHaveCount(0);
  } else {
    // The job handed it back: record it by hand (two steps, AD-Q-5).
    await page.getByRole('button', { name: 'Record refund…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('in the Kashier dashboard first');
    const reference = `KSH-E2E-${randomUUID().slice(0, 8)}`;
    await dialog.getByLabel(/^Kashier's refund reference/).fill(reference);
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(dialog).toContainText(reference);
    await expectNoBlockingA11yViolations(page);
    await dialog.getByRole('button', { name: 'Record refund' }).click();
    await expect(page.getByText(/^Refund of .+ recorded\.$/)).toBeVisible();
    await expect(page.getByLabel('Refund details')).toContainText('by you');
  }

  await page.goto(`/orders/${order.id}`);
  await expect(page.getByRole('heading', { level: 1, name: `Order ${order.orderNumber}` })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Refunds of this order' }).locator(`a[href="/refunds/${refund.id}"]`),
  ).toBeVisible();
  await expectNoBlockingA11yViolations(page);
});
