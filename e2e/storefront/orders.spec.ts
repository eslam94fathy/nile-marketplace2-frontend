// T-G3 against the real backend: a customer with a cash-on-delivery order (placed through the API) finds it
// in "Your orders" and in the "In progress" tab, opens it, and sees the API's values; an order id that
// isn't theirs shows "not found".
import { randomUUID } from 'node:crypto';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { placeCodOrder, signInThroughForm } from '../fixtures/orders';

test('orders: list → tab → detail; someone else’s order is not found', async ({
  page,
  accounts,
  customer,
}) => {
  const order = await placeCodOrder(accounts.backend, customer.accessToken);

  await signInThroughForm(page, customer.email, customer.password, '/account/orders');
  const row = page.getByRole('link', { name: new RegExp(`Order ${order.orderNumber}`) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Cash on delivery');
  await expect(row).toContainText('Placed');
  await expectNoBlockingA11yViolations(page);

  await page.getByRole('link', { name: 'Cancelled', exact: true }).click();
  await expect(page).toHaveURL(/\?status=cancelled$/);
  await expect(page.getByText('No orders here.')).toBeVisible();
  await page.getByRole('link', { name: 'In progress', exact: true }).click();
  await expect(row).toBeVisible();

  await row.click();
  await expect(page).toHaveURL(new RegExp(`/account/orders/${order.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: `Order ${order.orderNumber}` })).toBeVisible();
  await expect(page.getByText('Cash on delivery · To be paid on delivery')).toBeVisible();
  const block = page.getByRole('region', { name: /^Sold by / });
  await expect(block).toHaveCount(order.sellerOrders.length);
  await expect(block.first()).toContainText('Waiting for seller confirmation');
  await expectNoBlockingA11yViolations(page);

  // A well-formed order id that isn't this customer's (ORDER_NOT_FOUND), then one the backend refuses as
  // malformed (a UUID that isn't v7, VALIDATION_FAILED): both are "not found", never a retry.
  await page.goto(`/account/orders/${order.id.slice(0, -12)}000000000000`);
  await expect(page.getByRole('heading', { level: 1, name: /not found/i })).toBeVisible();
  await page.goto(`/account/orders/${randomUUID()}`);
  await expect(page.getByRole('heading', { level: 1, name: /not found/i })).toBeVisible();
});
