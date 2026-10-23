// T-E3 against the real backend: open a product with options, choose a variant (URL follows), add to cart while
// signed out → sign in → back on the same product with the variant and quantity preselected (FQ-6); unknown
// products are 404. The test picks a real product with an attribute and an in-stock variant.
import type { Schema } from '@nile/api';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

type ProductDetail = Schema<'ProductDetailDto'>;

test.describe('product page', () => {
  let product: ProductDetail;

  test.beforeAll(async ({ accounts }) => {
    const list = await accounts.backend.request('GET', '/api/v1/products?limit=40&inStock[eq]=true');
    for (const item of (list.body as { data: { slug: string }[] }).data) {
      const detail = await accounts.backend.request('GET', `/api/v1/products/${item.slug}`);
      const candidate = (detail.body as { data: ProductDetail }).data;
      if (
        candidate.attributes.length > 0 &&
        candidate.variants.some((v) => v.inStock && v.availableQuantity >= 2)
      ) {
        product = candidate;
        return;
      }
    }
    throw new Error('No in-stock product with options: run the backend seed (npm run seed:dev)');
  });

  test('choose a variant → sign in from "Add to cart" → back with the variant and quantity', async ({
    page,
    customer,
  }) => {
    const target = product.variants.find((v) => v.inStock && v.availableQuantity >= 2);
    if (target === undefined) throw new Error('no in-stock variant');

    await page.goto(`/p/${product.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: product.name })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(product.category.name);
    await expectNoBlockingA11yViolations(page);

    for (const option of target.options) {
      const attribute = product.attributes.find((a) => a.code === option.attributeCode);
      if (attribute === undefined) throw new Error(`attribute ${option.attributeCode} missing`);
      // The option chips are labels of visually hidden radios: click what a shopper clicks.
      await page
        .getByRole('group', { name: attribute.name })
        .getByText(option.value, { exact: true })
        .click();
    }
    await expect(page).toHaveURL(new RegExp(`variant=${target.id}`));
    await expect(page.getByRole('status')).toHaveText('In stock');
    await expect(page.getByText(target.sku, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Increase quantity' }).click();
    await page.getByRole('button', { name: 'Add to cart' }).click();

    await expect(page).toHaveURL(/\/login\?returnTo=/);
    await page.getByLabel(/^Email/).fill(customer.email);
    await page.getByLabel(/^Password/).fill(customer.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(new RegExp(`/p/${product.slug}\\?variant=${target.id}&qty=2$`));
    for (const option of target.options) {
      await expect(page.getByRole('radio', { name: option.value, exact: true })).toBeChecked();
    }
    await expect(page.getByLabel('Quantity', { exact: true })).toHaveValue('2');
    // FQ-6: nothing is added automatically; the shopper presses "Add to cart" again.
    await expect(page.getByRole('button', { name: 'Add to cart' })).toBeEnabled();
    await expect(page.getByText('Added to cart')).toHaveCount(0);
    await expect(page.getByRole('banner').getByRole('link', { name: 'Cart', exact: true })).toBeVisible();
  });

  test('opening a product by id redirects to its slug URL', async ({ page }) => {
    await page.goto(`/p/${product.id}`);
    await expect(page).toHaveURL(new RegExp(`/p/${product.slug}$`));
  });

  test('an unknown product is a 404 that says it is not available', async ({ page }) => {
    const response = await page.goto('/p/no-such-product-e2e');
    expect(response?.status()).toBe(404);
    await expect(page.getByText("This product isn't available any more.")).toBeVisible();
  });
});
