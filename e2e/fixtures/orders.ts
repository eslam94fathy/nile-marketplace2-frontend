import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { addMoney } from '@nile/domain';
import { expectData, type Accounts } from '@nile/test-utils/e2e';
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
export function placeCodOrder(
  backend: Accounts['backend'],
  token: string,
  chosenVariantId?: string,
): Promise<Schema<'OrderDetailDto'>> {
  return placeOrder(backend, token, 'cod', chosenVariantId);
}

/** As `placeCodOrder` with the payment method given (`kashier` needs the backend's fake gateway in E2E). */
export async function placeOrder(
  backend: Accounts['backend'],
  token: string,
  paymentMethod: 'cod' | 'kashier',
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
      paymentMethod,
      expectedTotal: addMoney(itemsTotal, fee),
    },
  });
  expect(placed.status).toBe(201);
  return (placed.body as { data: Schema<'CheckoutResultDto'> }).data.order;
}

/** The backend's worker creates the shipment shortly after "ready for pickup" (outbox, not in the request). */
const SHIPMENT_WAIT_MS = 15_000;

/** The order's shipment, waiting for the worker to create it after "ready for pickup". */
export async function shipmentOfOrder(
  backend: Accounts['backend'],
  adminToken: string,
  orderId: string,
): Promise<Schema<'AdminShipmentDto'>> {
  let shipment: Schema<'AdminShipmentDto'> | undefined;
  await expect
    .poll(
      async () => {
        const response = await backend.request('GET', `/api/v1/admin/shipments?orderId[eq]=${orderId}`, {
          token: adminToken,
        });
        [shipment] = expectData(response, 200) as Schema<'AdminShipmentDto'>[];
        return shipment !== undefined;
      },
      { message: 'No shipment after "ready for pickup"', timeout: SHIPMENT_WAIT_MS },
    )
    .toBe(true);
  if (shipment === undefined) throw new Error('No shipment after "ready for pickup"');
  return shipment;
}

/**
 * A COD order taken all the way to `delivered` through the API (seller accepts and readies, the admin assigns
 * the agent, the agent picks up, starts and delivers with the amount it is shown), for screens that need a
 * delivered parcel (reviews T-K5, returns T-K6).
 */
export async function deliveredCodOrder(
  backend: Accounts['backend'],
  tokens: {
    readonly customer: string;
    readonly seller: string;
    readonly admin: string;
    readonly agent: string;
  },
  agentId: string,
  variantId: string,
): Promise<Schema<'OrderDetailDto'>> {
  const order = await placeCodOrder(backend, tokens.customer, variantId);
  const sellerOrderId = order.sellerOrders[0]?.id ?? '';
  for (const step of ['accept', 'ready'] as const) {
    expectData(
      await backend.request('POST', `/api/v1/seller/orders/${sellerOrderId}/${step}`, {
        token: tokens.seller,
      }),
      200,
    );
  }
  const shipment = await shipmentOfOrder(backend, tokens.admin, order.id);
  if (shipment.agentId !== agentId) {
    expectData(
      await backend.request('POST', `/api/v1/admin/shipments/${shipment.id}/assign`, {
        token: tokens.admin,
        body: { agentId },
      }),
      200,
    );
  }
  for (const step of ['picked-up', 'out-for-delivery'] as const) {
    expectData(
      await backend.request('POST', `/api/v1/agent/shipments/${shipment.id}/${step}`, {
        token: tokens.agent,
      }),
      200,
    );
  }
  const { amountToCollect } = expectData(
    await backend.request('GET', `/api/v1/agent/shipments/${shipment.id}`, { token: tokens.agent }),
    200,
  ) as Schema<'AgentShipmentDto'>;
  expectData(
    await backend.request('POST', `/api/v1/agent/shipments/${shipment.id}/delivered`, {
      token: tokens.agent,
      idempotencyKey: randomUUID(),
      body: { codCollectedAmount: amountToCollect },
    }),
    200,
  );
  return order;
}
