// T-O4 cross-role flow (TO-Q4; spec 01 SF-07-C, SF-08, SF-18): a platform coupon set up by the admin through the
// API (limited to this test's seller, so no other test's cart is affected), the customer applies it at checkout,
// places a cash-on-delivery order, and sees the discount on the confirmation and the order page.
import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { addMoney, formatMoney } from '@nile/domain';
import { expectData } from '@nile/test-utils/e2e';
import { appUrl } from '../apps';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedVariant } from '../fixtures/catalog';
import { prepareCheckout } from '../fixtures/orders';
import { signInAs } from '../fixtures/sessions';

const STOREFRONT = appUrl('storefront');
/** The fixture's product costs 100.00; the coupon takes 20.00 off. */
const DISCOUNT = '20.00';
const ITEMS_AFTER_COUPON = '80.00';

test('platform coupon applied at checkout → COD order with the discount', async ({
  page,
  context,
  accounts,
  admin,
}) => {
  test.slow();
  const { backend } = accounts;
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const code = `E2E-${suffix}`;
  const [customer, seller] = await Promise.all([accounts.customer(), accounts.seller({ approved: true })]);
  const variantId = await publishedVariant(backend, seller.accessToken, suffix);
  expectData(
    await backend.request('POST', '/api/v1/admin/coupons', {
      token: admin.accessToken,
      body: {
        scope: 'seller',
        scopeSellerId: seller.sellerId,
        code,
        discountType: 'fixed',
        discountValue: DISCOUNT,
        minItemsSubtotal: '0.00',
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        perCustomerLimit: 1,
      } satisfies Schema<'AdminCreateCouponDto'>,
    }),
    201,
  );
  const { deliveryFee } = await prepareCheckout(backend, customer.accessToken, variantId);
  const total = formatMoney(addMoney(ITEMS_AFTER_COUPON, deliveryFee));

  await signInAs(context, 'storefront', customer);
  await page.goto(`${STOREFRONT}/checkout`);
  await expect(page.getByRole('radio', { name: /Home/ })).toBeChecked();
  await page.getByText('Cash on delivery', { exact: true }).click();
  await page.getByRole('button', { name: 'Have a coupon?' }).click();
  await page.getByRole('textbox', { name: /^Coupon code/ }).fill(code.toLowerCase());
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(`Coupon ${code} applied`)).toBeVisible();
  const summary = page.getByRole('complementary', { name: 'Order summary' });
  await expect(summary.getByText(`Coupon ${code}`)).toBeVisible();
  await expect(summary).toContainText(total);
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('button', { name: 'Place order' }).click();

  // SF-08: the confirmation shows the order totals with the coupon (TK4).
  await expect(page).toHaveURL(/\/checkout\/confirmation\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/^Thank you\. Your order .+ is placed\.$/)).toBeVisible();
  await expect(page.getByText(`Coupon ${code}`)).toBeVisible();
  await expect(page.getByText(total).first()).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  const orderId = page.url().split('/').at(-1) ?? '';

  const order = expectData(
    await backend.request('GET', `/api/v1/orders/${orderId}`, { token: customer.accessToken }),
    200,
  ) as Schema<'OrderDetailDto'>;
  expect(order.coupon?.code).toBe(code);
  expect(order.coupon?.discountTotal).toBe(DISCOUNT);
  expect(order.total).toBe(addMoney(ITEMS_AFTER_COUPON, deliveryFee));

  // SF-18: the order page shows the same lines.
  await page.goto(`${STOREFRONT}/account/orders/${orderId}`);
  await expect(page.getByText(`Coupon ${code}`)).toBeVisible();
  await expect(page.getByText(total).first()).toBeVisible();
});
