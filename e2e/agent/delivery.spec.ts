// T-H12 journey (workflow AG-1…AG-3, spec 04 AG-04, AG-05, AG-06) against the real backend, at phone width:
// a COD order is made ready and assigned to the signed-in agent (through the API); the agent picks it up,
// starts the delivery, collects the cash (ticking the API's amount) and finds it in the history.
import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedVariant } from '../fixtures/catalog';
import { placeCodOrder, shipmentOfOrder } from '../fixtures/orders';

/** Spec 04 §2.1: designed for a phone in one hand, from 360 px. */
const PHONE = { width: 360, height: 780 } as const;

test('full COD delivery in the agent app', async ({ page, signIn, accounts, admin, seller, customer }) => {
  test.slow();
  await page.setViewportSize(PHONE);
  const { backend } = accounts;
  const agent = await signIn('agent');
  const profile = expectData(
    await backend.request('GET', '/api/v1/agent/profile', { token: agent.accessToken }),
    200,
  ) as Schema<'AgentProfileDto'>;

  const variantId = await publishedVariant(backend, seller.accessToken, randomUUID().slice(0, 8));
  const order = await placeCodOrder(backend, customer.accessToken, variantId);
  const sellerOrderId = order.sellerOrders[0]?.id ?? '';
  for (const step of ['accept', 'ready'] as const) {
    expectData(
      await backend.request('POST', `/api/v1/seller/orders/${sellerOrderId}/${step}`, {
        token: seller.accessToken,
      }),
      200,
    );
  }
  const shipment = await shipmentOfOrder(backend, admin.accessToken, order.id);
  if (shipment.agentId !== profile.id) {
    expectData(
      await backend.request('POST', `/api/v1/admin/shipments/${shipment.id}/assign`, {
        token: admin.accessToken,
        body: { agentId: profile.id },
      }),
      200,
    );
  }

  // AG-04: the parcel is waiting under "To pick up".
  await page.goto('/');
  const card = page.getByRole('link', { name: new RegExp(`^Order ${order.orderNumber}`) });
  await expect(card).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await card.click();

  // AG-05: picked up → start delivery → delivered with the API's amount.
  await expect(page.getByRole('heading', { level: 1, name: `Order ${order.orderNumber}` })).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  const bar = page.getByRole('group', { name: 'Shipment actions' });
  await bar.getByRole('button', { name: 'Picked up' }).click();
  await page
    .getByRole('dialog', { name: 'Collected the parcel?' })
    .getByRole('button', { name: 'Picked up' })
    .click();
  await expect(page.getByText('Marked as picked up.', { exact: true })).toBeVisible();

  await bar.getByRole('button', { name: 'Start delivery' }).click();
  await expect(page.getByText('Delivery started.', { exact: true })).toBeVisible();

  await bar.getByRole('button', { name: 'Delivered' }).click();
  const sheet = page.getByRole('dialog', { name: 'Deliver the parcel' });
  await expectNoBlockingA11yViolations(page);
  await sheet.getByRole('checkbox', { name: /^I collected / }).click();
  await sheet.getByRole('button', { name: 'Confirm delivery' }).click();
  await expect(page.getByText(`Order ${order.orderNumber} is delivered.`, { exact: true })).toBeVisible();

  // AG-06: it is in the history now.
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('link', { name: new RegExp(`^Order ${order.orderNumber}`) })).toContainText(
    'Delivered',
  );
  await expectNoBlockingA11yViolations(page);
});
