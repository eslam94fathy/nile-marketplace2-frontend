// T-G4 against the real backend: a customer cancels the not-yet-confirmed seller order of a cash-on-delivery
// order from its page, with a note; the page shows the cancelled order, Cancel is gone, and the API agrees.
import type { Schema } from '@nile/api';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { placeCodOrder, signInThroughForm } from '../fixtures/orders';

test('cancel a COD seller order before the seller confirms it', async ({ page, accounts, customer }) => {
  const order = await placeCodOrder(accounts.backend, customer.accessToken);
  const sellerOrder = order.sellerOrders[0];
  if (sellerOrder === undefined) throw new Error('the order has no seller order');
  expect(sellerOrder.canCancel).toBe(true);

  await signInThroughForm(page, customer.email, customer.password, `/account/orders/${order.id}`);
  const block = page.getByRole('region', { name: `Sold by ${sellerOrder.businessName}` });
  await block.getByRole('button', { name: `Cancel the items from ${sellerOrder.businessName}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel these items' });
  await expect(dialog).toContainText("This can't be undone.");
  await expectNoBlockingA11yViolations(page);
  await dialog.getByRole('textbox', { name: 'Reason (optional)' }).fill('Ordered by mistake');
  await dialog.getByRole('button', { name: 'Cancel items' }).click();

  await expect(dialog).toBeHidden();
  await expect(block).toContainText('Cancelled');
  await expect(block.getByRole('button', { name: /Cancel the items/ })).toHaveCount(0);
  if (order.sellerOrders.length === 1) {
    await expect(page.getByText('No delivery fee is charged because nothing was delivered.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buy again' })).toBeVisible();
  }

  const after = (
    (await accounts.backend.request('GET', `/api/v1/orders/${order.id}`, { token: customer.accessToken }))
      .body as {
      data: Schema<'OrderDetailDto'>;
    }
  ).data;
  expect(after.sellerOrders.find((s) => s.id === sellerOrder.id)?.status).toBe('cancelled');
});
