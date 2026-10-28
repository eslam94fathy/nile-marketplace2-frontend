// T-H8 journey (workflow AD-3, spec 03 AD-07) against the real backend: the admin creates a top-level
// category, an attribute and an option in the console; a seller can then create a product and a variant with it.
import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

test('category → attribute → option → a seller uses it', async ({ page, signIn, accounts, seller }) => {
  test.slow();
  await signIn('admin');
  const suffix = randomUUID().slice(0, 8);
  const name = `E2E category ${suffix}`;
  const code = `e2e${suffix}`;

  await page.goto('/catalog/categories');
  await expect(page.getByRole('heading', { level: 1, name: 'Categories' })).toBeVisible();
  await page.getByRole('button', { name: 'Add top-level category' }).click();
  const create = page.getByRole('dialog', { name: 'Add category' });
  await create.getByLabel(/^Name/).fill(name);
  await create.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByText(`${name} was added.`, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  await expect(page).toHaveURL(/\?category=/);
  await expectNoBlockingA11yViolations(page);
  const categoryId = new URL(page.url()).searchParams.get('category') ?? '';

  await page.getByRole('button', { name: 'Add attribute' }).click();
  const attribute = page.getByRole('dialog', { name: 'Add attribute' });
  await attribute.getByLabel(/^Name/).fill('Size');
  await attribute.getByLabel(/^Code/).fill(code);
  await attribute.getByRole('button', { name: 'Add attribute' }).click();
  await expect(page.getByText('Size was added.', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Add option to Size' }).click();
  const optionDialog = page.getByRole('dialog', { name: 'Add option' });
  await optionDialog.getByLabel(/^Value/).fill('Large');
  await optionDialog.getByLabel(/^Code/).fill('large');
  await optionDialog.getByRole('button', { name: 'Add option' }).click();
  await expect(page.getByText('Large was added.', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Options of Size' })).toContainText('Large');
  await expectNoBlockingA11yViolations(page);

  // What sellers read when they create a variant (public, active categories only).
  const effective = expectData(
    await accounts.backend.request('GET', `/api/v1/categories/${categoryId}/attributes`),
    200,
  ) as Schema<'EffectiveAttributeDto'>[];
  const large = effective
    .find((item) => item.code === code)
    ?.options.find((option) => option.code === 'large');
  expect(large).toBeDefined();

  const product = expectData(
    await accounts.backend.request('POST', '/api/v1/seller/products', {
      token: seller.accessToken,
      body: {
        categoryId,
        name: `E2E product ${suffix}`,
        description: 'Made by the tests.',
      } satisfies Schema<'CreateProductDto'>,
    }),
    201,
  ) as Schema<'SellerProductDetailDto'>;
  expectData(
    await accounts.backend.request('POST', `/api/v1/seller/products/${product.id}/variants`, {
      token: seller.accessToken,
      body: {
        sku: `E2E-${suffix}`,
        price: '100',
        optionIds: [large?.id ?? ''],
        initialStock: 1,
        status: 'active',
      } satisfies Schema<'CreateVariantDto'>,
    }),
    201,
  );
});
