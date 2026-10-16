import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { expectData, type Accounts } from '@nile/test-utils/e2e';
import type { Page } from '@playwright/test';
import { appUrl } from '../apps';
import { expect } from './index';

// Seller catalog set-up for E2E (T-H3): a draft product with one variant, created through the seller app's
// own BFF with the browser's session (the signed-in seller), so no token is handled by the test.

const ORIGIN = appUrl('seller');
const HEADERS = { Origin: ORIGIN, 'X-Nile-Client': '1' };

async function bff<T>(page: Page, method: 'GET' | 'POST', path: string, data?: unknown): Promise<T> {
  const response = await page.context().request.fetch(`${ORIGIN}/api/bff${path}`, {
    method,
    headers: HEADERS,
    ...(data === undefined ? {} : { data }),
  });
  expect(response.ok(), `${method} ${path}: ${String(response.status())}`).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

/** The first active category, its first option per attribute, a draft with one variant of `initialStock`. */
export async function createProductWithVariant(page: Page, initialStock: number) {
  const tree = await bff<Schema<'CategoryNodeDto'>[]>(page, 'GET', '/categories');
  const category = tree[0];
  if (category === undefined) throw new Error('No active category: run the backend seed (npm run seed:dev)');
  const attributes = await bff<Schema<'EffectiveAttributeDto'>[]>(
    page,
    'GET',
    `/categories/${category.id}/attributes`,
  );
  const product = await bff<Schema<'SellerProductDetailDto'>>(page, 'POST', '/seller/products', {
    categoryId: category.id,
    name: `E2E stock ${randomUUID().slice(0, 8)}`,
    description: 'Made by the end-to-end tests.',
  } satisfies Schema<'CreateProductDto'>);
  const optionIds = attributes.map((attribute) => {
    const first = attribute.options[0];
    if (first === undefined) throw new Error(`Attribute ${attribute.code} has no options`);
    return first.id;
  });
  const variant = await bff<Schema<'SellerVariantDto'>>(
    page,
    'POST',
    `/seller/products/${product.id}/variants`,
    {
      sku: `E2E-${randomUUID().slice(0, 8)}`,
      price: '100',
      optionIds,
      initialStock,
      status: 'active',
    } satisfies Schema<'CreateVariantDto'>,
  );
  return { product, variant };
}

/** Publishes the product (it has an active variant), so customers can buy it. */
export async function publishProduct(page: Page, productId: string) {
  await bff<Schema<'SellerProductDetailDto'>>(page, 'POST', `/seller/products/${productId}/activate`);
}

/** A published product with one active in-stock variant, created as the seller through the API: its variant id. */
export async function publishedVariant(
  backend: Accounts['backend'],
  token: string,
  suffix: string,
): Promise<string> {
  return (await publishedProduct(backend, token, suffix)).variantId;
}

/** As `publishedVariant`, with the product's slug for its storefront page. */
export async function publishedProduct(
  backend: Accounts['backend'],
  token: string,
  suffix: string,
): Promise<{ readonly variantId: string; readonly slug: string }> {
  const tree = expectData(
    await backend.request('GET', '/api/v1/categories'),
    200,
  ) as Schema<'CategoryNodeDto'>[];
  const category = tree[0];
  if (category === undefined) throw new Error('No active category: run the backend seed (npm run seed:dev)');
  const attributes = expectData(
    await backend.request('GET', `/api/v1/categories/${category.id}/attributes`),
    200,
  ) as Schema<'EffectiveAttributeDto'>[];
  const product = expectData(
    await backend.request('POST', '/api/v1/seller/products', {
      token,
      body: {
        categoryId: category.id,
        name: `E2E delivery ${suffix}`,
        description: 'Made by the tests.',
      } satisfies Schema<'CreateProductDto'>,
    }),
    201,
  ) as Schema<'SellerProductDetailDto'>;
  const variant = expectData(
    await backend.request('POST', `/api/v1/seller/products/${product.id}/variants`, {
      token,
      body: {
        sku: `E2E-D-${suffix}`,
        price: '100',
        optionIds: attributes.map((attribute) => attribute.options[0]?.id ?? ''),
        initialStock: 5,
        status: 'active',
      } satisfies Schema<'CreateVariantDto'>,
    }),
    201,
  ) as Schema<'SellerVariantDto'>;
  expectData(await backend.request('POST', `/api/v1/seller/products/${product.id}/activate`, { token }), 200);
  return { variantId: variant.id, slug: product.slug };
}
