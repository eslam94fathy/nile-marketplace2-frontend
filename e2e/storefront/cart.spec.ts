// T-F1 against the real backend: a signed-in customer adds a variant from the product page (header badge
// follows), changes its quantity on the cart page (one debounced update, totals from the API), removes it,
// and the cart is empty again. Uses a real in-stock product with options.
import type { Schema } from '@nile/api';
import type { Page } from '@playwright/test';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

type ProductDetail = Schema<'ProductDetailDto'>;

async function signInThroughForm(page: Page, email: string, password: string, returnTo: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('add from the product page → change quantity → remove', async ({ page, accounts, customer }) => {
  let product: ProductDetail | undefined;
  const list = await accounts.backend.request('GET', '/api/v1/products?limit=40&inStock[eq]=true');
  for (const item of (list.body as { data: { slug: string }[] }).data) {
    const detail = (await accounts.backend.request('GET', `/api/v1/products/${item.slug}`)).body as {
      data: ProductDetail;
    };
    if (detail.data.variants.some((v) => v.inStock && v.availableQuantity >= 3)) {
      product = detail.data;
      break;
    }
  }
  if (product === undefined)
    throw new Error('No product with 3+ in stock: run the backend seed (npm run seed:dev)');
  const variant = product.variants.find((v) => v.inStock && v.availableQuantity >= 3);
  if (variant === undefined) throw new Error('no variant');

  // Straight to the product with the variant chosen, as after a shared link or the sign-in round trip.
  await signInThroughForm(
    page,
    customer.email,
    customer.password,
    `/p/${product.slug}?variant=${variant.id}`,
  );
  await expect(page.getByRole('heading', { level: 1, name: product.name })).toBeVisible();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByText('Added to cart')).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Cart, 1 item' })).toBeVisible();

  await page.getByRole('link', { name: 'View cart' }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole('link', { name: product.name, exact: true })).toBeVisible();
  await expect(page.getByText('Items (1)')).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  const increase = page.getByRole('button', { name: `Increase quantity, ${product.name}` });
  const updates: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().includes('/api/bff/cart/items/'))
      updates.push(request.url());
  });
  await increase.click();
  await increase.click();
  await expect(page.getByText('Items (3)')).toBeVisible();
  expect(updates).toHaveLength(1);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Cart, 3 items' })).toBeVisible();

  await page.getByRole('button', { name: `Remove ${product.name}` }).click();
  await expect(page.getByText('Your cart is empty.')).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Cart', exact: true })).toBeVisible();
});
