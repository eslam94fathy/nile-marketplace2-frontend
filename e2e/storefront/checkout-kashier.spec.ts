// T-F4 against the real backend (PAYMENT_GATEWAY=fake): a card checkout leaves for the (intercepted) Kashier
// page, which sends the shopper back cross-site to /checkout/payment-return with a made-up "success" in the
// URL. The session cookie survives that top-level return (SameSite=Lax), the page ignores the URL and
// keeps confirming until the signed webhook arrives, then shows the placed order.
// Needs NILE_BACKEND_DIR (the backend checkout, built) to send the webhook; skipped without it.
// The expired path needs KASHIER_PAYMENT_TTL_MINUTES=1 in the backend's .env; skipped with a longer window.
import type { Schema } from '@nile/api';
import type { Accounts } from '@nile/test-utils/e2e';
import type { Page } from '@playwright/test';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { backendDir, FAKE_KASHIER_ORIGIN, sendKashierWebhook } from '../fixtures/kashier';

/** The storefront's sessionStorage key for the order awaiting card payment (spec 01 SF-07-A1). */
const PENDING_PAYMENT_ORDER_KEY = 'nile.pendingPaymentOrderId';

type ProductDetail = Schema<'ProductDetailDto'>;
type Governorate = Schema<'GovernorateDto'>;

/** Longest payment window the expired-path test waits out (backend KASHIER_PAYMENT_TTL_MINUTES=1). */
const MAX_PAYMENT_WINDOW_MS = 2 * 60_000;

async function signInThroughForm(page: Page, email: string, password: string, returnTo: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** One in-stock item in the cart and a default address in a deliverable governorate. */
async function readyForCheckout(backend: Accounts['backend'], token: string) {
  const list = await backend.request('GET', '/api/v1/products?limit=40&inStock[eq]=true');
  let variantId: string | undefined;
  for (const item of (list.body as { data: { slug: string }[] }).data) {
    const detail = (await backend.request('GET', `/api/v1/products/${item.slug}`)).body as {
      data: ProductDetail;
    };
    variantId = detail.data.variants.find((v) => v.inStock)?.id;
    if (variantId !== undefined) break;
  }
  if (variantId === undefined)
    throw new Error('No product in stock: run the backend seed (npm run seed:dev)');
  const added = await backend.request('POST', '/api/v1/cart/items', {
    token,
    body: { variantId, quantity: 1 },
  });
  expect(added.status).toBe(201);
  const governorates = (
    (await backend.request('GET', '/api/v1/governorates')).body as { data: Governorate[] }
  ).data;
  const zone = governorates.find((g) => g.isDeliverable && typeof g.deliveryFee === 'string');
  if (zone === undefined) throw new Error('No deliverable governorate: set a delivery fee as admin');
  const address = await backend.request('POST', '/api/v1/me/addresses', {
    token,
    body: {
      label: 'Home',
      recipientName: 'Mona Adel',
      recipientPhone: '+201001234567',
      governorateId: zone.id,
      city: 'Nasr City',
      area: 'District 7',
      street: 'Abbas El Akkad',
      building: '12',
      isDefault: true,
    },
  });
  expect(address.status).toBe(201);
}

/**
 * Stands in for Kashier's page: sends the shopper back to the return URL the way Kashier does (a cross-site
 * top-level GET), with query parameters that claim success.
 */
async function fakeKashier(page: Page, returnUrl: string): Promise<() => boolean> {
  let visited = false;
  await page.route(`${FAKE_KASHIER_ORIGIN}/**`, async (route) => {
    visited = true;
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>Kashier</title><meta http-equiv="refresh" content="0;url=${returnUrl}?paymentStatus=SUCCESS&merchantOrderId=tampered">`,
    });
  });
  return () => visited;
}

async function placeCardOrder(page: Page): Promise<string> {
  await expect(page.getByRole('radio', { name: /Home/ })).toBeChecked();
  await page.getByText('Pay by card (Kashier)', { exact: true }).click();
  await page.getByRole('button', { name: 'Place order' }).click();
  // The page leaves for Kashier at once; the order id it kept for the return page names the order.
  await expect(page).toHaveURL(/\/checkout\/payment-return\?/);
  const orderId = await page.evaluate((key) => window.sessionStorage.getItem(key), PENDING_PAYMENT_ORDER_KEY);
  if (orderId === null) throw new Error('the order id was not kept for the return page');
  return orderId;
}

async function readOrder(backend: Accounts['backend'], token: string, orderId: string) {
  return (
    (await backend.request('GET', `/api/v1/orders/${orderId}`, { token })).body as {
      data: Schema<'OrderDetailDto'>;
    }
  ).data;
}

test('card payment: Kashier → return page (tampered URL ignored) → webhook → placed', async ({
  page,
  accounts,
  customer,
  baseURL,
}) => {
  const dir = backendDir();
  test.skip(dir === null, 'set NILE_BACKEND_DIR to the backend checkout to send Kashier webhooks');
  if (dir === null) return;
  await readyForCheckout(accounts.backend, customer.accessToken);
  const kashierVisited = await fakeKashier(page, `${baseURL ?? ''}/checkout/payment-return`);

  await signInThroughForm(page, customer.email, customer.password, '/checkout');
  const orderId = await placeCardOrder(page);

  await expect(page).toHaveURL(/\/checkout\/payment-return\?paymentStatus=SUCCESS/);
  expect(kashierVisited()).toBe(true);
  // Still signed in after the cross-site return (SameSite=Lax), and no success before the API says so.
  await expect(page.getByText('Confirming your payment…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pay now' })).toBeVisible();
  await expect(page.getByText(/Payment received/)).toHaveCount(0);
  await expectNoBlockingA11yViolations(page);

  await sendKashierWebhook(dir, orderId, 'paid');
  await expect(page.getByText(/^Payment received\. Your order .+ is placed\.$/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('link', { name: 'View order' })).toHaveAttribute(
    'href',
    `/account/orders/${orderId}`,
  );
  const order = await readOrder(accounts.backend, customer.accessToken, orderId);
  expect(order.status).toBe('placed');
  expect(order.paymentStatus).toBe('paid');
});

test('card payment not completed: the order expires and the return page says so', async ({
  page,
  accounts,
  customer,
  baseURL,
}) => {
  await readyForCheckout(accounts.backend, customer.accessToken);
  await fakeKashier(page, `${baseURL ?? ''}/checkout/payment-return`);
  await signInThroughForm(page, customer.email, customer.password, '/checkout');
  const orderId = await placeCardOrder(page);

  const order = await readOrder(accounts.backend, customer.accessToken, orderId);
  const paymentWindow = Date.parse(order.paymentExpiresAt ?? '') - Date.parse(order.createdAt);
  test.skip(
    !(paymentWindow <= MAX_PAYMENT_WINDOW_MS),
    `payment window is ${Math.round(paymentWindow / 60_000)} min; set KASHIER_PAYMENT_TTL_MINUTES=1 in the backend`,
  );
  test.setTimeout(paymentWindow + 3 * 60_000);

  await expect(page.getByText('Confirming your payment…')).toBeVisible();
  // The backend's expiry job cancels the order after the window (JOB_KASHIER_PAYMENT_EXPIRY_INTERVAL_MS).
  await expect(
    page.getByText("Your payment wasn't completed in time and the order was cancelled."),
  ).toBeVisible({ timeout: paymentWindow + 2 * 60_000 });
  await expect(page.getByRole('button', { name: 'Buy again' })).toBeVisible();
});
