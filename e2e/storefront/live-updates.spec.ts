// T-J5 against the real backend and its realtime service (design 01 §15.10): the customer's order page is open
// while the seller confirms the order through the API. A placed COD order is never polled (SF-18 polls only
// while awaiting payment), so only the socket's `seller_order.updated` can bring the change without a reload.
// Needs the backend's CORS_ALLOWED_ORIGINS to list http://localhost:4100 (OQ-17).
import { randomUUID } from 'node:crypto';
import { expectData } from '@nile/test-utils/e2e';
import { SELLER_ORDER_STATUS_LABELS } from '@nile/domain';
import { expect, test } from '../fixtures';
import { publishedVariant } from '../fixtures/catalog';
import { placeCodOrder, signInThroughForm } from '../fixtures/orders';

const REALTIME_PATH = '/realtime/';
/** Engine.IO "open" + Socket.IO "connect" acknowledged: the server has put the socket in its rooms. */
const SOCKET_CONNECTED = '40';

test("the seller's confirmation shows on the customer's open order page without a reload", async ({
  page,
  accounts,
  customer,
  seller,
}) => {
  test.slow();
  const variantId = await publishedVariant(accounts.backend, seller.accessToken, randomUUID().slice(0, 8));
  const order = await placeCodOrder(accounts.backend, customer.accessToken, variantId);
  const sellerOrder = order.sellerOrders[0];
  if (sellerOrder === undefined) throw new Error('the order has no seller order');

  // Listen from the socket's first frame on, so the connect acknowledgement can't be missed.
  const connected = new Promise<void>((resolve) => {
    page.on('websocket', (ws) => {
      if (!ws.url().includes(REALTIME_PATH)) return;
      ws.on('framereceived', (frame) => {
        if (String(frame.payload).startsWith(SOCKET_CONNECTED)) resolve();
      });
    });
  });
  await signInThroughForm(page, customer.email, customer.password, `/account/orders/${order.id}`);
  const block = page.getByRole('region', { name: `Sold by ${sellerOrder.businessName}` });
  await expect(block).toContainText(SELLER_ORDER_STATUS_LABELS.customer.placed);
  await connected;

  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  expectData(
    await accounts.backend.request('POST', `/api/v1/seller/orders/${sellerOrder.id}/accept`, {
      token: seller.accessToken,
    }),
    200,
  );

  await expect(block).toContainText(SELLER_ORDER_STATUS_LABELS.customer.accepted, { timeout: 15_000 });
  expect(navigations).toBe(0);
});
