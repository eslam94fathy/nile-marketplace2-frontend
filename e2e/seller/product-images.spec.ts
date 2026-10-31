// T-O4 (spec 02 SE-08 images, TL1): two images uploaded to the media storage (MinIO locally), the second moved
// first through its menu, a description added; the API's order and the storefront product page follow.
import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { appUrl } from '../apps';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedProduct } from '../fixtures/catalog';
import { solidPng } from '../fixtures/images';

/** Upload, processing (`waitForMedia`) and attach. */
const IMAGE_READY_MS = 30_000;

test('upload two product images, reorder them and describe the main one', async ({
  page,
  signIn,
  accounts,
}) => {
  test.slow();
  const seller = await signIn('seller');
  const suffix = randomUUID().slice(0, 8);
  const { productId, slug } = await publishedProduct(accounts.backend, seller.accessToken, suffix);

  await page.goto(`/products/${productId}`);
  await expect(page.getByText('No images yet.')).toBeVisible();
  const add = page.getByLabel('Add images');
  await add.setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: solidPng() });
  await expect(page.getByText('Image added.').first()).toBeVisible({ timeout: IMAGE_READY_MS });
  await add.setInputFiles({
    name: 'second.png',
    mimeType: 'image/png',
    buffer: solidPng(400, 400, [14, 42, 59]),
  });
  const second = page.getByRole('button', { name: 'Actions for image 2 of 2' });
  await expect(second).toBeVisible({ timeout: IMAGE_READY_MS });
  await expectNoBlockingA11yViolations(page);

  const before = expectData(
    await accounts.backend.request('GET', `/api/v1/seller/products/${productId}`, {
      token: seller.accessToken,
    }),
    200,
  ) as Schema<'SellerProductDetailDto'>;
  const secondId = before.images[1]?.id;

  await second.click();
  await page.getByRole('menuitem', { name: 'Move earlier' }).click();
  await expect(page.getByText('Image moved to position 1 of 2.')).toBeAttached();

  await page.getByRole('button', { name: 'Actions for image 1 of 2' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit image' });
  await edit.getByRole('textbox', { name: /^Image description/ }).fill(`Navy ${suffix}`);
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Image saved.').first()).toBeVisible();

  const after = expectData(
    await accounts.backend.request('GET', `/api/v1/seller/products/${productId}`, {
      token: seller.accessToken,
    }),
    200,
  ) as Schema<'SellerProductDetailDto'>;
  expect(after.images[0]?.id).toBe(secondId);

  // The storefront shows the moved image first, described by the seller's text.
  await page.goto(`${appUrl('storefront')}/p/${slug}`);
  await expect(page.getByRole('img', { name: `Navy ${suffix}` }).first()).toBeVisible();
});
