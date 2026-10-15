// T-H2 journey (workflow S-2, spec 02 SE-08 … SE-11) against the real backend: an approved seller creates
// a draft, adds a variant, publishes the product, and it is visible on the storefront.
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

/** Picks the first option of a Radix Select that is not disabled ("Already exists"). */
async function chooseFirst(page: Page, combobox: ReturnType<Page['getByRole']>) {
  await combobox.click();
  await page.getByRole('option').and(page.locator(':not([aria-disabled="true"])')).first().click();
}

test('create draft → add variant → publish → visible on the storefront', async ({ page, signIn }) => {
  test.slow(); // several screens with axe, then the storefront
  await signIn('seller');
  const name = `E2E product ${randomUUID().slice(0, 8)}`;
  const sku = `E2E-${randomUUID().slice(0, 8)}`;

  await page.goto('/products');
  await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible();
  await page.getByRole('link', { name: 'Add product' }).first().click();

  await expect(page.getByRole('heading', { level: 1, name: 'New product' })).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await chooseFirst(page, page.getByRole('combobox', { name: /^Category/ }));
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Description/).fill('Made by the end-to-end tests.');
  await page.getByRole('button', { name: 'Create draft' }).click();

  await expect(page.getByText('Draft created. Add a variant to publish it.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled();
  await expectNoBlockingA11yViolations(page);

  await page.getByRole('button', { name: 'Add variant' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add variant' });
  // One select per attribute of the category (none for a category without options), plus Status.
  const optionSelects = dialog.getByRole('combobox').filter({ hasNotText: 'Active' });
  for (const select of await optionSelects.all()) await chooseFirst(page, select);
  await dialog.getByLabel(/^SKU/).fill(sku);
  await dialog.getByLabel(/^Price/).fill('150');
  await dialog.getByLabel(/^Initial stock/).fill('5');
  await expectNoBlockingA11yViolations(page);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByText('Variant added.')).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('cell', { name: sku })).toBeVisible();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Product published.')).toBeVisible();
  await expect(page.getByText('Visible in store')).toBeVisible();

  const storeLink = page.getByRole('link', { name: 'View in store' });
  const href = await storeLink.getAttribute('href');
  expect(href).toMatch(/\/p\/[a-z0-9-]+$/);
  await page.goto(href ?? '');
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  // Back in the portal, the list shows it published.
  await page.goBack();
  await page.goto('/products?status=active');
  await expect(page.getByRole('link', { name })).toBeVisible();
});

test('a seller waiting for approval is sent back from /products/new', async ({ page, accounts }) => {
  const seller = await accounts.seller({ approved: false });
  await page.goto('/login?returnTo=%2Fproducts%2Fnew');
  await page.getByLabel(/^Email/).fill(seller.email);
  await page.getByLabel(/^Password/).fill(seller.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole('link', { name: 'Add product' })).toHaveCount(0);
  await expectNoBlockingA11yViolations(page);
});
