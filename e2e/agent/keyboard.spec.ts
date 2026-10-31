// T-I2 keyboard-only walkthrough of the agent workflows (A-2 shift, A-3 work shipments) at phone width
// against the real backend: go on shift, pick up, start the delivery and deliver a COD parcel with the tick
// box. The order, its readiness and the assignment are set up through the API.
import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedVariant } from '../fixtures/catalog';
import { press, toggle } from '../fixtures/keyboard';
import { assignedReturnPickup } from '../fixtures/returns';
import { placeCodOrder, shipmentOfOrder } from '../fixtures/orders';

test('agent delivery by keyboard only', async ({ page, signIn, accounts, admin, seller, customer }) => {
  test.slow();
  await page.setViewportSize({ width: 360, height: 780 });
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

  // A-2 the shift switch works with Space (going off shift asks first: Escape keeps the shift).
  await page.goto('/');
  const shift = page.getByRole('switch', { name: /^(On|Off) shift$/ });
  if ((await shift.getAttribute('aria-checked')) === 'false') {
    await toggle(page, shift);
    await expect(page.getByRole('switch', { name: 'On shift' })).toBeVisible();
  }
  await toggle(page, page.getByRole('switch', { name: 'On shift' }));
  await expect(page.getByRole('dialog', { name: 'Go off shift?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'On shift' })).toBeFocused();

  // A-3 the parcel: picked up → start delivery → delivered with the tick box.
  await press(page, page.getByRole('link', { name: new RegExp(`^Order ${order.orderNumber}`) }));
  await expect(page.getByRole('heading', { level: 1, name: `Order ${order.orderNumber}` })).toBeVisible();
  const bar = page.getByRole('group', { name: 'Shipment actions' });
  await press(page, bar.getByRole('button', { name: 'Picked up' }));
  const pickedUp = page.getByRole('dialog', { name: 'Collected the parcel?' });
  await press(page, pickedUp.getByRole('button', { name: 'Picked up' }));
  await expect(page.getByText('Marked as picked up.', { exact: true })).toBeVisible();
  await press(page, bar.getByRole('button', { name: 'Start delivery' }));
  await expect(page.getByText('Delivery started.', { exact: true })).toBeVisible();

  await press(page, bar.getByRole('button', { name: 'Delivered' }));
  const sheet = page.getByRole('dialog', { name: 'Deliver the parcel' });
  await expect(sheet).toBeVisible();
  await toggle(page, sheet.getByRole('checkbox', { name: /^I collected / }));
  await press(page, sheet.getByRole('button', { name: 'Confirm delivery' }));
  await expect(page.getByText(`Order ${order.orderNumber} is delivered.`, { exact: true })).toBeVisible();
  await press(page, page.getByRole('link', { name: 'Back to shipments' }));
  await expect(page.getByRole('heading', { level: 1, name: 'Shipments' })).toBeVisible();
});

// T-O2: a return pickup by keyboard only at phone width (T-N1 R1, R3): collected from the customer, then handed
// to the seller, each confirmed in its dialog. The delivered order, the return and its assignment come from the API.
test('return pickup by keyboard only', async ({ page, signIn, accounts, admin, seller, customer }) => {
  test.slow();
  await page.setViewportSize({ width: 360, height: 780 });
  const { backend } = accounts;
  const agent = await signIn('agent');
  const profile = expectData(
    await backend.request('GET', '/api/v1/agent/profile', { token: agent.accessToken }),
    200,
  ) as Schema<'AgentProfileDto'>;
  const variantId = await publishedVariant(backend, seller.accessToken, randomUUID().slice(0, 8));
  const { shipmentId } = await assignedReturnPickup(
    backend,
    {
      customer: customer.accessToken,
      seller: seller.accessToken,
      admin: admin.accessToken,
      agent: agent.accessToken,
    },
    profile.id,
    variantId,
  );

  await page.goto(`/shipments/${shipmentId}`);
  await press(page, page.getByRole('button', { name: 'Collected from the customer' }));
  const collected = page.getByRole('dialog', { name: 'Collected the items?' });
  await expect(collected).toBeVisible();
  await press(page, collected.getByRole('button', { name: 'Collected from the customer' }));
  await expect(page.getByText('Marked as collected.').first()).toBeVisible();

  await press(page, page.getByRole('button', { name: 'Handed to the seller' }));
  const handOver = page.getByRole('dialog', { name: 'Hand the items over?' });
  await expect(handOver).toBeVisible();
  await press(page, handOver.getByRole('button', { name: 'Handed to the seller' }));
  await expect(page.getByText('Handed to the seller.').first()).toBeVisible();
  await expectNoBlockingA11yViolations(page);
});
