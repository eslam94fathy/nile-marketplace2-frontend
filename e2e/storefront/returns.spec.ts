// T-K6 journey (spec 01 SF-18, SF-26…SF-28) against the real backend: a delivered COD order (through the API),
// "Return items" on the order page, one item, "Changed my mind" (no photo needed), the refund to a mobile
// wallet, then the return detail and cancelling it before pickup.
import { randomUUID } from 'node:crypto';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedVariant } from '../fixtures/catalog';
import { deliveredCodOrder } from '../fixtures/orders';

test('request a return for a delivered parcel, then cancel it', async ({
  page,
  signIn,
  accounts,
  admin,
  seller,
  agent,
}) => {
  test.slow();
  const customer = await signIn('storefront');
  const { backend } = accounts;
  const variantId = await publishedVariant(backend, seller.accessToken, randomUUID().slice(0, 8));
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

  await page.goto(`/account/orders/${order.id}`);
  await page.getByRole('link', { name: 'Return items' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Return items' })).toBeVisible();
  await page.getByRole('button', { name: `Increase quantity, ${item.productName}` }).click();
  await page.getByRole('radio', { name: 'Changed my mind' }).check();
  await page.getByRole('radio', { name: 'Mobile wallet' }).check();
  await page.getByRole('textbox', { name: /Wallet mobile number/ }).fill('1012345678');
  await expect(page.getByText('Estimated refund')).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('button', { name: 'Request return' }).click();

  await expect(page.getByText(/^Return .* requested\.$/)).toBeVisible();
  await expect(page).toHaveURL(/\/account\/returns\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Waiting for the seller').first()).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  await page.getByRole('button', { name: 'Cancel return' }).click();
  await page
    .getByRole('dialog', { name: 'Cancel this return?' })
    .getByRole('button', { name: 'Cancel return' })
    .click();
  await expect(page.getByText('Return cancelled.')).toBeVisible();
  await expect(page.getByText('Cancelled').first()).toBeVisible();
});
