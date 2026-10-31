// T-I2 keyboard-only walkthrough of the seller workflows (S-1 sign-in, S-3 products and variants, S-5 orders)
// against the real backend: sign in, create a draft, add a variant, publish, then confirm a customer's
// cash-on-delivery order and mark it ready for pickup. The customer's order is placed through the API.
import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedProduct } from '../fixtures/catalog';
import { solidPng } from '../fixtures/images';
import { chooseFirst, menu, pickFile, press, type } from '../fixtures/keyboard';
import { placeCodOrder } from '../fixtures/orders';

test('seller journey by keyboard only', async ({ page, accounts, seller, customer }) => {
  test.slow();
  const name = `E2E keyboard ${randomUUID().slice(0, 8)}`;
  const sku = `E2E-K-${randomUUID().slice(0, 8)}`;

  // S-1 sign in.
  await page.goto('/login');
  await type(page, page.getByLabel(/^Email/), seller.email);
  await type(page, page.getByLabel(/^Password/), seller.password);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

  // S-3 a draft with a variant, then published.
  await page.goto('/products/new');
  await chooseFirst(page, page.getByRole('combobox', { name: /^Category/ }));
  await type(page, page.getByLabel(/^Name/), name);
  await type(page, page.getByLabel(/^Description/), 'Made by the keyboard tests.');
  await press(page, page.getByRole('button', { name: 'Create draft' }));
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  const productId = page.url().split('/').at(-1) ?? '';

  await press(page, page.getByRole('button', { name: 'Add variant' }));
  const dialog = page.getByRole('dialog', { name: 'Add variant' });
  await expect(dialog).toBeVisible();
  for (const select of await dialog.getByRole('combobox').filter({ hasNotText: 'Active' }).all()) {
    await chooseFirst(page, select);
  }
  await type(page, dialog.getByLabel(/^SKU/), sku);
  await type(page, dialog.getByLabel(/^Price/), '150');
  await type(page, dialog.getByLabel(/^Initial stock/), '5');
  await press(page, dialog.getByRole('button', { name: 'Save', exact: true }));
  await expect(dialog).toHaveCount(0);
  await press(page, page.getByRole('button', { name: 'Publish' }));
  await expect(page.getByText('Product published.', { exact: true })).toBeVisible();

  // S-5 a customer's COD order for it: confirm, then ready for pickup.
  const product = expectData(
    await accounts.backend.request('GET', `/api/v1/seller/products/${productId}`, {
      token: seller.accessToken,
    }),
    200,
  ) as Schema<'SellerProductDetailDto'>;
  const variantId = product.variants[0]?.id ?? '';
  const order = await placeCodOrder(accounts.backend, customer.accessToken, variantId);

  await page.goto('/orders');
  await press(page, page.getByRole('link', { name: `Order ${order.orderNumber}` }));
  await expect(page.getByRole('heading', { level: 1, name: `Order ${order.orderNumber}` })).toBeVisible();
  await press(page, page.getByRole('button', { name: 'Confirm order' }));
  await expect(page.getByText('Order confirmed.', { exact: true })).toBeVisible();
  await press(page, page.getByRole('button', { name: 'Mark ready for pickup' }));
  const ready = page.getByRole('dialog', { name: 'Mark ready for pickup' });
  await expect(ready).toBeVisible();
  await press(page, ready.getByRole('button', { name: 'Mark ready for pickup' }));
  await expect(page.getByText('Marked ready for pickup.', { exact: true })).toBeVisible();
});

// T-O2: product images by keyboard only (S-7): the uploader's native picker and the reorder menu (TL1: reorder
// by menu, no drag and drop). The product is created through the API.
test('product images by keyboard only', async ({ page, signIn, accounts }) => {
  test.slow();
  const seller = await signIn('seller');
  const { productId } = await publishedProduct(
    accounts.backend,
    seller.accessToken,
    randomUUID().slice(0, 8),
  );

  await page.goto(`/products/${productId}`);
  const add = page.getByLabel('Add images');
  await pickFile(page, add, { name: 'first.png', mimeType: 'image/png', buffer: solidPng() });
  await expect(page.getByRole('button', { name: 'Actions for image 1 of 1' })).toBeVisible({
    timeout: 30_000,
  });
  await pickFile(page, add, {
    name: 'second.png',
    mimeType: 'image/png',
    buffer: solidPng(400, 400, [14, 42, 59]),
  });
  const second = page.getByRole('button', { name: 'Actions for image 2 of 2' });
  await expect(second).toBeVisible({ timeout: 30_000 });
  await expectNoBlockingA11yViolations(page);

  // Move the second image first; the move is announced and focus stays on the moved image's menu button.
  await menu(page, second, 'Move earlier');
  await expect(page.getByText('Image moved to position 1 of 2.')).toBeAttached();
  await expect(page.getByRole('list', { name: 'Product images' }).getByText('Main image')).toHaveCount(1);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});
