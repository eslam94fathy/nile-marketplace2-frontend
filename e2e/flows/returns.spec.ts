// T-O4 cross-role flow (TO-Q4; workflows §6 returns, covers TL3-Q4): customer → seller → admin → agent → seller →
// admin → customer, each role's step through its own app, the set-up (a delivered COD order) through the API.
// The customer returns a damaged item with a photo (MinIO upload) and a mobile-wallet refund; the seller approves;
// the admin assigns the return pickup; the agent collects it and hands it to the seller; the seller confirms
// receipt; the admin records the wallet transfer on AD-34; the customer sees the return refunded.
import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { appUrl } from '../apps';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedVariant } from '../fixtures/catalog';
import { solidPng } from '../fixtures/images';
import { deliveredCodOrder } from '../fixtures/orders';
import { currentToken, signInAs } from '../fixtures/sessions';

const STOREFRONT = appUrl('storefront');
const SELLER = appUrl('seller');
const ADMIN = appUrl('admin');
const AGENT = appUrl('agent');

/** The worker creates the return shipment and the refund after the matching step (outbox). */
const WORKER_WAIT_MS = 20_000;

test('return: request with a photo → approve → pickup → receipt → refund recorded', async ({
  page,
  context,
  accounts,
  admin,
}) => {
  test.setTimeout(300_000);
  const { backend } = accounts;
  const suffix = randomUUID().slice(0, 8);
  const agentName = `E2E Agent ${suffix}`;
  const [customer, seller, agent] = await Promise.all([
    accounts.customer(),
    accounts.seller({ approved: true }),
    accounts.agent({ fullName: agentName }),
  ]);
  const variantId = await publishedVariant(backend, seller.accessToken, suffix);
  const order = await deliveredCodOrder(
    backend,
    {
      customer: customer.accessToken,
      seller: seller.accessToken,
      admin: admin.accessToken,
      agent: agent.accessToken,
    },
    agent.agentId,
    variantId,
  );
  const item = order.sellerOrders[0]?.items[0];
  if (item === undefined) throw new Error('order without items');

  // Customer (SF-26): a damaged item needs a description and a photo.
  await signInAs(context, 'storefront', customer);
  await page.goto(`${STOREFRONT}/account/orders/${order.id}`);
  await page.getByRole('link', { name: 'Return items' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Return items' })).toBeVisible();
  await page.getByRole('button', { name: `Increase quantity, ${item.productName}` }).click();
  await page.getByRole('radio', { name: 'Damaged' }).check();
  await page.getByRole('textbox', { name: /^Description/ }).fill('The box arrived crushed.');
  await page
    .getByLabel('Photos')
    .setInputFiles({ name: 'damage.png', mimeType: 'image/png', buffer: solidPng() });
  await expect(page.getByText('Ready', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('radio', { name: 'Mobile wallet' }).check();
  await page.getByRole('textbox', { name: /Wallet mobile number/ }).fill('1012345678');
  await page.getByRole('button', { name: 'Request return' }).click();
  await expect(page).toHaveURL(/\/account\/returns\/[0-9a-f-]{36}$/);
  const returnId = page.url().split('/').at(-1) ?? '';
  await expect(page.getByText('Waiting for the seller').first()).toBeVisible();

  // Seller (SE-19): the customer's photo shows; approve.
  await signInAs(context, 'seller', seller);
  await page.goto(`${SELLER}/returns/${returnId}`);
  await expect(page.getByRole('img', { name: "Customer's photo 1 of 1" })).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('dialog', { name: 'Approve return' }).getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Return approved.', { exact: true })).toBeVisible();
  await expect(page.getByText('Approved, awaiting pickup').first()).toBeVisible();

  // Admin (AD-13): assign the return pickup (or reassign, when auto-assignment chose someone) to the agent.
  const adminToken = await signInAs(context, 'admin', admin);
  let shipment: Schema<'AdminShipmentDto'> | undefined;
  await expect
    .poll(
      async () => {
        const found = expectData(
          await backend.request('GET', `/api/v1/admin/shipments?orderId[eq]=${order.id}&kind[eq]=return`, {
            token: adminToken,
          }),
          200,
        ) as Schema<'AdminShipmentDto'>[];
        shipment = found.find((candidate) => candidate.returnId === returnId);
        return shipment !== undefined;
      },
      { message: 'No return shipment after the approval', timeout: WORKER_WAIT_MS },
    )
    .toBe(true);
  const shipmentId = shipment?.id ?? '';
  await page.goto(`${ADMIN}/delivery/shipments/${shipmentId}`);
  await page.getByRole('button', { name: /^(Assign|Reassign)$/ }).click();
  const assign = page.getByRole('dialog', { name: `Assign the shipment of order ${order.orderNumber}` });
  await assign.getByRole('button', { name: `Assign to ${agentName}` }).click();
  await expect(page.getByText(`Assigned to ${agentName}.`, { exact: true })).toBeVisible();

  // Agent (AG-05): R1 collected from the customer, R3 handed to the seller.
  await signInAs(context, 'agent', agent);
  await page.goto(`${AGENT}/shipments/${shipmentId}`);
  await expect(page.getByRole('heading', { level: 1, name: /Return pickup/ })).toBeVisible();
  await page.getByRole('button', { name: 'Collected from the customer' }).click();
  await page
    .getByRole('dialog', { name: 'Collected the items?' })
    .getByRole('button', { name: 'Collected from the customer' })
    .click();
  await expect(page.getByText('Marked as collected.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Handed to the seller' }).click();
  await page
    .getByRole('dialog', { name: 'Hand the items over?' })
    .getByRole('button', { name: 'Handed to the seller' })
    .click();
  await expect(page.getByText('Handed to the seller.').first()).toBeVisible();

  // Seller (SE-19): confirm receipt, restocking the item (on by default).
  await page.goto(`${SELLER}/returns/${returnId}`);
  await expect(page.getByText('To check').first()).toBeVisible();
  await page.getByRole('button', { name: 'Confirm receipt' }).click();
  const receipt = page.getByRole('dialog', { name: 'Confirm receipt' });
  await expect(
    receipt.getByRole('checkbox', { name: `Put ${item.productName} back in stock` }),
  ).toBeChecked();
  await receipt.getByRole('button', { name: 'Confirm receipt' }).click();
  await expect(page.getByText('Receipt confirmed.', { exact: true })).toBeVisible();

  // Admin (AD-15 → AD-34): the wallet refund waits for a transfer; record it in two steps.
  const findRefund = async () => {
    const refunds = expectData(
      await backend.request('GET', '/api/v1/admin/payments/refunds?sort=-createdAt&limit=100', {
        token: await currentToken(context, 'admin'),
      }),
      200,
    ) as Schema<'RefundDto'>[];
    return refunds.find((refund) => refund.orderId === order.id);
  };
  await expect
    .poll(async () => (await findRefund())?.status, { timeout: WORKER_WAIT_MS })
    .toBe('pending_manual');
  const refund = await findRefund();
  await page.goto(`${ADMIN}/orders/${order.id}`);
  await page
    .getByRole('table', { name: 'Refunds of this order' })
    .locator(`a[href="/refunds/${refund?.id ?? ''}"]`)
    .click();
  await expect(page.getByRole('heading', { level: 1, name: /^Refund of / })).toBeVisible();
  await expect(page.getByText('Mobile wallet +201012345678')).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('button', { name: 'Record refund…' }).click();
  const record = page.getByRole('dialog');
  const reference = `WALLET-E2E-${suffix}`;
  await record.getByLabel(/^Transfer reference/).fill(reference);
  await record.getByRole('button', { name: 'Continue' }).click();
  await expect(record).toContainText(reference);
  await record.getByRole('button', { name: 'Record refund' }).click();
  await expect(page.getByText(/^Refund of .+ recorded\.$/)).toBeVisible();

  // Customer (SF-28): the return is completed and refunded.
  await page.goto(`${STOREFRONT}/account/returns/${returnId}`);
  await expect(page.getByText('Completed').first()).toBeVisible();
  await expect(page.getByText(/^Refunded /)).toBeVisible();
  await expectNoBlockingA11yViolations(page);
});
