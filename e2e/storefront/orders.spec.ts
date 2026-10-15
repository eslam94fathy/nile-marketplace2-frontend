// T-G3 against the real backend: a customer with a cash-on-delivery order (placed through the API) finds it
// in "Your orders" and in the "In progress" tab, opens it, and sees the API's values; an order id that
// isn't theirs shows "not found".
import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { addMoney } from '@nile/domain';
import type { Accounts } from '@nile/test-utils/e2e';
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

/** One in-stock item, a deliverable default address, then `POST /checkout` (COD) as the customer. */
async function placeCodOrder(backend: Accounts['backend'], token: string): Promise<Schema<'OrderDetailDto'>> {
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
  const cart = await backend.request('POST', '/api/v1/cart/items', {
    token,
    body: { variantId, quantity: 1 },
  });
  expect(cart.status).toBe(201);
  const zones = ((await backend.request('GET', '/api/v1/governorates')).body as { data: Governorate[] }).data;
  const zone = zones.find((g) => g.isDeliverable && typeof g.deliveryFee === 'string');
  const fee = zone?.deliveryFee;
  if (zone === undefined || fee === undefined || fee === null)
    throw new Error('No deliverable governorate: set a delivery fee as admin');
  const address = (
    await backend.request('POST', '/api/v1/me/addresses', {
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
    })
  ).body as { data: Schema<'AddressDto'> };
  const itemsTotal = (cart.body as { data: Schema<'CartDto'> }).data.itemsTotal;
  const placed = await backend.request('POST', '/api/v1/checkout', {
    token,
    idempotencyKey: randomUUID(),
    body: {
      addressId: address.data.id,
      paymentMethod: 'cod',
      expectedTotal: addMoney(itemsTotal, fee),
    },
  });
  expect(placed.status).toBe(201);
  return (placed.body as { data: Schema<'CheckoutResultDto'> }).data.order;
}

test('orders: list → tab → detail; someone else’s order is not found', async ({
  page,
  accounts,
  customer,
}) => {
  const order = await placeCodOrder(accounts.backend, customer.accessToken);

  await signInThroughForm(page, customer.email, customer.password, '/account/orders');
  const row = page.getByRole('link', { name: new RegExp(`Order ${order.orderNumber}`) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Cash on delivery');
  await expect(row).toContainText('Placed');
  await expectNoBlockingA11yViolations(page);

  await page.getByRole('link', { name: 'Cancelled', exact: true }).click();
  await expect(page).toHaveURL(/\?status=cancelled$/);
  await expect(page.getByText('No orders here.')).toBeVisible();
  await page.getByRole('link', { name: 'In progress', exact: true }).click();
  await expect(row).toBeVisible();

  await row.click();
  await expect(page).toHaveURL(new RegExp(`/account/orders/${order.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: `Order ${order.orderNumber}` })).toBeVisible();
  await expect(page.getByText('Cash on delivery · To be paid on delivery')).toBeVisible();
  const block = page.getByRole('region', { name: /^Sold by / });
  await expect(block).toHaveCount(order.sellerOrders.length);
  await expect(block.first()).toContainText('Waiting for seller confirmation');
  await expectNoBlockingA11yViolations(page);

  // A well-formed order id that isn't this customer's (ORDER_NOT_FOUND), then one the backend refuses as
  // malformed (a UUID that isn't v7, VALIDATION_FAILED): both are "not found", never a retry.
  await page.goto(`/account/orders/${order.id.slice(0, -12)}000000000000`);
  await expect(page.getByRole('heading', { level: 1, name: /not found/i })).toBeVisible();
  await page.goto(`/account/orders/${randomUUID()}`);
  await expect(page.getByRole('heading', { level: 1, name: /not found/i })).toBeVisible();
});
