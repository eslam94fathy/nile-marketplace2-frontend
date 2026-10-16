// T-H9 journey (workflow AD-4, spec 03 AD-08, AD-10, AD-13) against the real backend: the admin sets a
// delivery fee and creates an agent in the console; a customer's COD order becomes a shipment once the
// seller marks it ready; the admin assigns that shipment to the new agent.
import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { placeCodOrder } from '../fixtures/orders';

test('set fee → create agent → assign shipment', async ({
  page,
  signIn,
  accounts,
  admin,
  seller,
  customer,
}) => {
  test.slow();
  const { backend } = accounts;
  await signIn('admin');
  const suffix = randomUUID().slice(0, 8);

  // AD-08: a fee for Cairo (deliverable from now on).
  await page.goto('/delivery/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Delivery settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Set fee for Cairo' }).click();
  const feeDialog = page.getByRole('dialog', { name: 'Delivery fee for Cairo' });
  await feeDialog.getByLabel(/^Delivery fee/).fill('45');
  await feeDialog.getByRole('button', { name: 'Save fee' }).click();
  await expect(page.getByText(/^Cairo: delivery fee /)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop delivering to Cairo' })).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  // AD-10: a new agent, then AD-11.
  const agentName = `E2E Agent ${suffix}`;
  const agentEmail = `e2e-agent-${suffix}@example.test`;
  await page.goto('/delivery/agents/new');
  await page.getByLabel(/^Email/).fill(agentEmail);
  await page.getByLabel(/^Full name/).fill(agentName);
  await page.getByLabel(/^Mobile number/).fill(`010${String(Date.now()).slice(-8)}`);
  await page.getByRole('combobox', { name: /^Home governorate/ }).click();
  await page.getByRole('option', { name: 'Cairo', exact: true }).click();
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('button', { name: 'Create agent and send invitation' }).click();
  await expect(page.getByText(`Invitation sent to ${agentEmail}. It's valid for 72 hours.`)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: agentName })).toBeVisible();
  await expect(page).toHaveURL(/\/delivery\/agents\/[0-9a-f-]{36}$/);
  await expectNoBlockingA11yViolations(page);

  // A shipment: the seller's product, a COD order, accepted and ready for pickup (through the API).
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
  const shipments = expectData(
    await backend.request('GET', `/api/v1/admin/shipments?orderId[eq]=${order.id}`, {
      token: admin.accessToken,
    }),
    200,
  ) as Schema<'AdminShipmentDto'>[];
  const shipment = shipments[0];
  if (shipment === undefined) throw new Error('No shipment after "ready for pickup"');

  // AD-13: assign (or reassign, when auto-assignment found someone) to the new agent.
  await page.goto(`/delivery/shipments/${shipment.id}`);
  await expect(page.getByRole('heading', { level: 1, name: `Order ${order.orderNumber}` })).toBeVisible();
  await page.getByRole('button', { name: /^(Assign|Reassign)$/ }).click();
  const dialog = page.getByRole('dialog', { name: `Assign the shipment of order ${order.orderNumber}` });
  await expect(dialog).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await dialog.getByRole('button', { name: `Assign to ${agentName}` }).click();
  await expect(page.getByText(`Assigned to ${agentName}.`)).toBeVisible();
  await expect(page.getByRole('link', { name: agentName })).toBeVisible();
  await expect(page.getByText('Assigned', { exact: true }).first()).toBeVisible();
});

/** A published product with one active in-stock variant, created as the seller through the API. */
async function publishedVariant(
  backend: Parameters<typeof placeCodOrder>[0],
  token: string,
  suffix: string,
): Promise<string> {
  const tree = expectData(
    await backend.request('GET', '/api/v1/categories'),
    200,
  ) as Schema<'CategoryNodeDto'>[];
  const category = tree[0];
  if (category === undefined) throw new Error('No active category: run the backend seed (npm run seed:dev)');
  const attributes = expectData(
    await backend.request('GET', `/api/v1/categories/${category.id}/attributes`),
    200,
  ) as Schema<'EffectiveAttributeDto'>[];
  const product = expectData(
    await backend.request('POST', '/api/v1/seller/products', {
      token,
      body: {
        categoryId: category.id,
        name: `E2E delivery ${suffix}`,
        description: 'Made by the tests.',
      } satisfies Schema<'CreateProductDto'>,
    }),
    201,
  ) as Schema<'SellerProductDetailDto'>;
  const variant = expectData(
    await backend.request('POST', `/api/v1/seller/products/${product.id}/variants`, {
      token,
      body: {
        sku: `E2E-D-${suffix}`,
        price: '100',
        optionIds: attributes.map((attribute) => attribute.options[0]?.id ?? ''),
        initialStock: 5,
        status: 'active',
      } satisfies Schema<'CreateVariantDto'>,
    }),
    201,
  ) as Schema<'SellerVariantDto'>;
  expectData(await backend.request('POST', `/api/v1/seller/products/${product.id}/activate`, { token }), 200);
  return variant.id;
}
