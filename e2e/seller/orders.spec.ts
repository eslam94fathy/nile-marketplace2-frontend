// T-H4 journey (workflow S-4, spec 02 SE-14, SE-15) against the real backend: a customer places a cash-on-
// delivery order for this seller's product; the seller finds it under "To confirm", confirms it and marks it
// ready for pickup.
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { createProductWithVariant, publishProduct } from '../fixtures/catalog';
import { placeCodOrder } from '../fixtures/orders';

test('customer COD order → seller confirms → ready for pickup', async ({
  page,
  signIn,
  accounts,
  customer,
}) => {
  test.slow();
  await signIn('seller');
  const { product, variant } = await createProductWithVariant(page, 5);
  await publishProduct(page, product.id);
  const order = await placeCodOrder(accounts.backend, customer.accessToken, variant.id);

  await page.goto('/orders');
  const row = page.getByRole('row').filter({ hasText: `Order ${order.orderNumber}` });
  await expect(row).toBeVisible();
  await expect(row.getByRole('timer')).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await row.getByRole('link', { name: `Order ${order.orderNumber}` }).click();

  await expect(page.getByRole('heading', { level: 1, name: `Order ${order.orderNumber}` })).toBeVisible();
  await expect(
    page.getByText('Unconfirmed orders are cancelled automatically after 24 hours.'),
  ).toBeVisible();
  await expect(page.getByText('Customer details are handled by the delivery agent.')).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  await page.getByRole('button', { name: 'Confirm order' }).click();
  await expect(page.getByText('Order confirmed.', { exact: true })).toBeVisible();
  await expect(page.getByText('Confirmed — prepare')).toBeVisible();

  await page.getByRole('button', { name: 'Mark ready for pickup' }).click();
  const dialog = page.getByRole('dialog', { name: 'Mark ready for pickup' });
  await dialog.getByRole('button', { name: 'Mark ready for pickup' }).click();
  await expect(page.getByText('Marked ready for pickup.', { exact: true })).toBeVisible();
  await expect(page.getByText('Ready for pickup', { exact: true }).first()).toBeVisible();

  await page.goto('/orders?tab=awaiting-pickup');
  await expect(page.getByRole('link', { name: `Order ${order.orderNumber}` })).toBeVisible();
});
