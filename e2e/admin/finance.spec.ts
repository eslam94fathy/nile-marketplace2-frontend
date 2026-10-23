// T-H11 journey (workflow AD-6, spec 03 AD-18, AD-20) against the real backend: a COD order is delivered by
// an agent (through the API), the ledger books the cash the agent holds, and the admin records it as
// received in the console; the agent's COD cash goes back to zero.
import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedVariant } from '../fixtures/catalog';
import { placeCodOrder } from '../fixtures/orders';

/** The ledger is booked by the backend worker after delivery [SPEC 12]: allow it this long. */
const LEDGER_WAIT_MS = 60_000;

test('delivered COD order → agent holds cash → admin records it received', async ({
  page,
  signIn,
  accounts,
  admin,
  seller,
  customer,
  agent,
}) => {
  test.slow();
  const { backend } = accounts;
  const suffix = randomUUID().slice(0, 8);

  // A COD order, ready for pickup, assigned to this test's agent, picked up and delivered.
  const variantId = await publishedVariant(backend, seller.accessToken, suffix);
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
  const [shipment] = expectData(
    await backend.request('GET', `/api/v1/admin/shipments?orderId[eq]=${order.id}`, {
      token: admin.accessToken,
    }),
    200,
  ) as Schema<'AdminShipmentDto'>[];
  if (shipment === undefined) throw new Error('No shipment after "ready for pickup"');
  if (shipment.agentId !== agent.agentId) {
    expectData(
      await backend.request('POST', `/api/v1/admin/shipments/${shipment.id}/assign`, {
        token: admin.accessToken,
        body: { agentId: agent.agentId },
      }),
      200,
    );
  }
  for (const step of ['picked-up', 'out-for-delivery'] as const) {
    expectData(
      await backend.request('POST', `/api/v1/agent/shipments/${shipment.id}/${step}`, {
        token: agent.accessToken,
      }),
      200,
    );
  }
  expectData(
    await backend.request('POST', `/api/v1/agent/shipments/${shipment.id}/delivered`, {
      token: agent.accessToken,
      idempotencyKey: randomUUID(),
      body: { codCollectedAmount: shipment.amountToCollect },
    }),
    200,
  );

  const codCash = async () => {
    const accountsOfAgent = expectData(
      await backend.request(
        'GET',
        `/api/v1/admin/finance/accounts?ownerId[eq]=${agent.agentId}&accountType[eq]=agent_cod_cash`,
        { token: admin.accessToken },
      ),
      200,
    ) as Schema<'AccountDto'>[];
    return accountsOfAgent[0]?.balance ?? '0.00';
  };
  await expect.poll(codCash, { timeout: LEDGER_WAIT_MS }).toBe(shipment.amountToCollect);

  // AD-18: the agent's COD cash, then AD-20 prefilled from the row.
  await signIn('admin');
  await page.goto(`/finance/accounts?type=agent_cod_cash&owner=${agent.agentId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Finance accounts' })).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('link', { name: 'Record cash received' }).click();
  await expect(page).toHaveURL(new RegExp(`/finance/remittances\\?agent=${agent.agentId}$`));

  await page.getByRole('button', { name: 'Record cash received' }).click();
  const dialog = page.getByRole('dialog', { name: 'Record cash received' });
  await expect(dialog.getByText(/^Holds .+ in COD cash\.$/)).toBeVisible();
  await dialog.getByLabel(/^Amount/).fill(shipment.amountToCollect);
  await dialog.getByLabel(/^Note/).fill(`E2E ${suffix}`);
  await expectNoBlockingA11yViolations(page);
  await dialog.getByRole('button', { name: 'Continue' }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm cash received' });
  await expect(confirm).toContainText('Their COD cash goes down by this amount.');
  await confirm.getByRole('button', { name: 'Record cash received' }).click();
  await expect(page.getByText(/received from .+ recorded\.$/)).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: `E2E ${suffix}` })).toContainText('you');

  await expect.poll(codCash, { timeout: LEDGER_WAIT_MS }).toBe('0.00');
});
