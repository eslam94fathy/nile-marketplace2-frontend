// T-O4 (spec 02 SE-15, SE-24…SE-26, TL6): "Get help with this order" on a seller order opens the new-ticket form
// with the order chosen; the seller sends it and lands on the thread; the ticket is in the Open list.
import { randomUUID } from 'node:crypto';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedProduct } from '../fixtures/catalog';
import { placeCodOrder } from '../fixtures/orders';
import { currentToken } from '../fixtures/sessions';

test('ticket about a seller order from its page', async ({ page, context, signIn, accounts, customer }) => {
  test.slow();
  await signIn('seller');
  const suffix = randomUUID().slice(0, 8);
  const { variantId } = await publishedProduct(
    accounts.backend,
    await currentToken(context, 'seller'),
    suffix,
  );
  const order = await placeCodOrder(accounts.backend, customer.accessToken, variantId);
  const subject = `Pickup question ${suffix}`;

  await page.goto('/orders');
  await page.getByRole('link', { name: `Order ${order.orderNumber}` }).click();
  await page.getByRole('link', { name: 'Get help with this order' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New ticket' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /^Order/ })).toContainText(order.orderNumber);
  // TL6-Q2: only the order is preset; the seller chooses the category.
  await page.getByRole('combobox', { name: /^Category/ }).click();
  await page.getByRole('option', { name: 'Order' }).click();
  await page.getByRole('textbox', { name: /^Subject/ }).fill(subject);
  await page.getByRole('textbox', { name: /^Message/ }).fill('When will the agent come?');
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('button', { name: 'Send ticket' }).click();

  await expect(page).toHaveURL(/\/support\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: subject })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Messages' }).getByText('When will the agent come?'),
  ).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  await page.goto('/support');
  await expect(page.getByRole('article').filter({ hasText: subject })).toBeVisible();
});
