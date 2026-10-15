import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
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
