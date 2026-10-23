// T-F3 against the real backend: a customer with one item in the cart and a saved address in a deliverable
// governorate places a cash-on-delivery order. The confirmation page shows the order, the order is in
// `GET /orders`, the cart is empty, and the total sent equals items total + delivery fee.
import type { Schema } from '@nile/api';
import { addMoney } from '@nile/domain';
import type { Page } from '@playwright/test';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

type ProductDetail = Schema<'ProductDetailDto'>;
type Governorate = Schema<'GovernorateDto'>;

async function signInThroughForm(page: Page, email: string, password: string, returnTo: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('cash on delivery: cart → checkout → order placed', async ({ page, accounts, customer }) => {
  const { backend } = accounts;
  const token = customer.accessToken;
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
  expect(
    (await backend.request('POST', '/api/v1/cart/items', { token, body: { variantId, quantity: 1 } })).status,
  ).toBe(201);

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

  // Requests, not bodies: one Place order click is one POST /checkout.
  const checkouts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/bff/checkout'))
      checkouts.push(request.url());
  });

  await signInThroughForm(page, customer.email, customer.password, '/checkout');
  await expect(page.getByRole('radio', { name: /Home/ })).toBeChecked();
  // The radio is visually hidden; its card-like label is what the shopper clicks.
  await page.getByText('Cash on delivery', { exact: true }).click();
  await expect(page.getByRole('radio', { name: /Cash on delivery/ })).toBeChecked();
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('button', { name: 'Place order' }).click();

  await expect(page).toHaveURL(/\/checkout\/confirmation\/[0-9a-f-]{36}$/);
  const placed = page.getByText(/^Thank you\. Your order .+ is placed\.$/);
  await expect(placed).toBeVisible();
  await expect(page.getByText(/in cash on delivery\.$/)).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  const orderId = page.url().split('/').at(-1) ?? '';
  const orders = (await backend.request('GET', '/api/v1/orders', { token })).body as {
    data: { id: string; orderNumber: string; total: string; paymentMethod: string }[];
  };
  const created = orders.data.find((o) => o.id === orderId);
  expect(created?.paymentMethod).toBe('cod');
  await expect(placed).toContainText(created?.orderNumber ?? '-');
  expect(checkouts).toHaveLength(1);
  // The order's total is the one confirmed on the page: items total + the governorate's fee.
  const detail = (await backend.request('GET', `/api/v1/orders/${orderId}`, { token })).body as {
    data: Schema<'OrderDetailDto'>;
  };
  expect(detail.data.deliveryFee).toBe(addMoney(zone.deliveryFee ?? '0'));
  expect(detail.data.total).toBe(addMoney(detail.data.itemsTotal, detail.data.deliveryFee));

  const cart = (await backend.request('GET', '/api/v1/cart', { token })).body as {
    data: { itemCount: number };
  };
  expect(cart.data.itemCount).toBe(0);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Cart', exact: true })).toBeVisible();
});
