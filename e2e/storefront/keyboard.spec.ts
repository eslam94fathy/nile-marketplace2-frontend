// T-I2 keyboard-only walkthrough of the customer workflows (C-1, C-2, C-4…C-8) against the real backend: skip
// link, sign-in, product, add to cart, checkout with cash on delivery, the order, and cancelling it. Set-up
// through the API (a seller's product, a deliverable address); every UI step by keyboard only.
import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedProduct } from '../fixtures/catalog';
import { check, press, type } from '../fixtures/keyboard';

test('customer journey by keyboard only', async ({ page, accounts, seller, customer }) => {
  test.slow();
  const { backend } = accounts;
  const { slug } = await publishedProduct(backend, seller.accessToken, randomUUID().slice(0, 8));
  const zones = expectData(
    await backend.request('GET', '/api/v1/governorates'),
    200,
  ) as Schema<'GovernorateDto'>[];
  const zone = zones.find((governorate) => governorate.isDeliverable);
  if (zone === undefined) throw new Error('No deliverable governorate: set a delivery fee as admin');
  expectData(
    await backend.request('POST', '/api/v1/me/addresses', {
      token: customer.accessToken,
      body: {
        label: 'Home',
        recipientName: 'Mona Adel',
        recipientPhone: '+201001234567',
        governorateId: zone.id,
        city: 'Nasr City',
        area: 'District 7',
        street: 'Abbas El Akkad',
        building: '12',
        isDefault: true,
      },
    }),
    201,
  );

  // The skip link is the first stop and moves focus to the main content.
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();

  // C-2 sign in, sent back to the product.
  await page.goto(`/login?returnTo=${encodeURIComponent(`/p/${slug}`)}`);
  await type(page, page.getByLabel(/^Email/), customer.email);
  await type(page, page.getByLabel(/^Password/), customer.password);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/p/${slug}`));

  // C-1 / C-4 the product's only variant is chosen already; add it to the cart.
  await press(page, page.getByRole('button', { name: 'Add to cart' }));
  await expect(page.getByText('Added to cart').first()).toBeVisible();
  await page.goto('/cart');
  await expectNoBlockingA11yViolations(page);
  await press(page, page.getByRole('link', { name: 'Proceed to checkout' }));

  // C-5 / C-6 checkout: the default address is chosen; pick cash on delivery and place the order.
  await expect(page).toHaveURL(/\/checkout$/);
  await check(
    page,
    page.getByRole('group', { name: 'Choose a payment method' }),
    page.getByRole('radio', { name: /Cash on delivery/ }),
  );
  await press(page, page.getByRole('button', { name: 'Place order' }));
  await expect(page).toHaveURL(/\/checkout\/confirmation\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/^Thank you\. Your order .+ is placed\.$/)).toBeVisible();

  // C-7 / C-8 the order, then cancelling the seller's items from its dialog.
  const orderId = page.url().split('/').at(-1) ?? '';
  await page.goto(`/account/orders/${orderId}`);
  const cancel = page.getByRole('button', { name: /^Cancel the items from / });
  await press(page, cancel);
  const dialog = page.getByRole('dialog', { name: 'Cancel these items' });
  await expect(dialog).toBeVisible();
  await type(page, dialog.getByRole('textbox', { name: 'Reason (optional)' }), 'Ordered by mistake');
  await press(page, dialog.getByRole('button', { name: 'Cancel items' }));
  await expect(dialog).toBeHidden();
  await expect(cancel).toHaveCount(0);
  // Focus is never lost to the page body after the dialog closes.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});
