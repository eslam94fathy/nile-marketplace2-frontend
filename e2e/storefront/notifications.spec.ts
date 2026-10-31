// T-J6 against the real backend, its worker and realtime service (design 01 §15.10, DQ-13): the seller accepts
// an order through the API; the backend writes the customer's "Order accepted" notification [VERIFIED backend
// user-event-mapping] and announces it with `notification.created`, so the bell's count and panel update
// without a reload. Push itself is checked by hand (docs/frontend/push-checklist.md).
// Needs the backend's CORS_ALLOWED_ORIGINS to list http://localhost:4100 (OQ-17).
import { randomUUID } from 'node:crypto';
import { expectData } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedVariant } from '../fixtures/catalog';
import { placeCodOrder, signInThroughForm } from '../fixtures/orders';

const REALTIME_PATH = '/realtime/';
/** Engine.IO "open" + Socket.IO "connect" acknowledged: the server has put the socket in its rooms. */
const SOCKET_CONNECTED = '40';
const BELL = /^Notifications, (\d+) unread$/;

test("a seller's action brings the customer a notification in the bell, linking to the order", async ({
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

  const connected = new Promise<void>((resolve) => {
    page.on('websocket', (ws) => {
      if (!ws.url().includes(REALTIME_PATH)) return;
      ws.on('framereceived', (frame) => {
        if (String(frame.payload).startsWith(SOCKET_CONNECTED)) resolve();
      });
    });
  });
  await signInThroughForm(page, customer.email, customer.password, '/');
  const bell = page.getByRole('button', { name: BELL });
  await expect(bell).toBeVisible();
  await connected;
  const before = Number(BELL.exec((await bell.getAttribute('aria-label')) ?? '')?.[1] ?? Number.NaN);

  expectData(
    await accounts.backend.request('POST', `/api/v1/seller/orders/${sellerOrder.id}/accept`, {
      token: seller.accessToken,
    }),
    200,
  );

  // Within the socket's reach, well before the 60 s fallback poll.
  await expect(page.getByRole('button', { name: `Notifications, ${String(before + 1)} unread` })).toBeVisible(
    {
      timeout: 15_000,
    },
  );
  await page.getByRole('button', { name: BELL }).click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  const item = panel.getByRole('link', { name: /Order accepted/ }).first();
  await expect(item).toHaveAttribute('href', `/account/orders/${order.id}`);
  await expectNoBlockingA11yViolations(page);

  await item.click();
  await expect(page).toHaveURL(new RegExp(`/account/orders/${order.id}$`));
  await expect(page.getByRole('button', { name: `Notifications, ${String(before)} unread` })).toBeVisible();
});
