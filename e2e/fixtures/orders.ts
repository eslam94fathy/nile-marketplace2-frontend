import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { addMoney } from '@nile/domain';
import type { Accounts } from '@nile/test-utils/e2e';
import type { Page } from '@playwright/test';
import { expect } from './index';

type ProductDetail = Schema<'ProductDetailDto'>;
type Governorate = Schema<'GovernorateDto'>;

// Storefront set-up shared by the order specs (T-G3, T-G4): signing in through the form (spare-port runs
// can't use the per-app signIn fixture) and a cash-on-delivery order placed through the API.

export async function signInThroughForm(page: Page, email: string, password: string, returnTo: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/**
 * One in-stock item (`variantId`, or the first one found), a deliverable default address, then
 * `POST /checkout` (COD) as the customer.
 */
export async function placeCodOrder(
  backend: Accounts['backend'],
  token: string,
  chosenVariantId?: string,
): Promise<Schema<'OrderDetailDto'>> {
  const list = await backend.request('GET', '/api/v1/products?limit=40&inStock[eq]=true');
  let variantId = chosenVariantId;
  for (const item of chosenVariantId === undefined ? (list.body as { data: { slug: string }[] }).data : []) {
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
