// T-E2 against the real backend: search from the header, sort, filters in the URL (Back restores them),
// "Load more", attribute facets on a category page, and invalid URL values dropped. Uses whatever products
// the backend has: the test reads the data first and adapts.
import type { Schema } from '@nile/api';
import type { Page } from '@playwright/test';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

type Product = Schema<'ProductListItemDto'>;
type Attribute = Schema<'EffectiveAttributeDto'>;

const listItems = (page: Page) => page.getByRole('region', { name: 'Products' }).getByRole('article');

test.describe('product listing', () => {
  let sample: Product;

  test.beforeAll(async ({ accounts }) => {
    const response = await accounts.backend.request('GET', '/api/v1/products?limit=1');
    const [first] = (response.body as { data: Product[] }).data;
    if (first === undefined)
      throw new Error('The backend has no products: run the backend seed (npm run seed:dev)');
    sample = first;
  });

  test('header search → results → sort and "In stock only" in the URL → Back restores', async ({ page }) => {
    const word = sample.name.split(/\s+/).find((part) => part.length >= 2) ?? sample.name;
    await page.goto('/');
    const search = page.getByRole('banner').getByRole('search');
    await search.getByRole('searchbox').fill(word);
    await search.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(new RegExp(`/search\\?q=${encodeURIComponent(word)}$`));
    await expect(page.getByRole('heading', { level: 1, name: `Results for "${word}"` })).toBeVisible();
    await expect(listItems(page).first()).toBeVisible();
    await expectNoBlockingA11yViolations(page);

    await page.getByRole('combobox', { name: 'Sort by' }).click();
    await expect(page.getByRole('option', { name: 'Best match' })).toBeVisible();
    await page.getByRole('option', { name: 'Price: low to high' }).click();
    await expect(page).toHaveURL(/sort=price-asc/);

    await page
      .getByRole('complementary', { name: 'Filters' })
      .getByRole('checkbox', { name: 'In stock only' })
      .click();
    await expect(page).toHaveURL(/inStock=1/);
    await expect(page.getByRole('list', { name: 'Active filters' })).toContainText('In stock');

    await page.goBack();
    await expect(page).not.toHaveURL(/inStock=1/);
    await expect(
      page.getByRole('complementary', { name: 'Filters' }).getByRole('checkbox', { name: 'In stock only' }),
    ).not.toBeChecked();
  });

  test('"Load more" appends the next page without duplicates', async ({ page, accounts }) => {
    const firstPage = await accounts.backend.request('GET', '/api/v1/products?limit=20');
    test.skip(
      !(firstPage.body as { meta: { hasMore: boolean } }).meta.hasMore,
      'needs more than 20 products',
    );
    await page.goto('/search');
    await expect(listItems(page)).toHaveCount(20);
    await page.getByRole('button', { name: 'Load more' }).click();
    await expect.poll(() => listItems(page).count()).toBeGreaterThan(20);
    const names = await listItems(page).getByRole('heading').allTextContents();
    const links = await listItems(page)
      .getByRole('heading')
      .getByRole('link')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(new Set(links).size).toBe(links.length);
    expect(names.length).toBe(links.length);
  });

  test('category page: attribute facets filter through the URL', async ({ page, accounts }) => {
    const response = await accounts.backend.request(
      'GET',
      `/api/v1/categories/${sample.category.id}/attributes`,
    );
    const attributes = (response.body as { data: Attribute[] }).data;
    const facet = attributes.find((attribute) => attribute.options.length > 0);
    test.skip(facet === undefined, `category ${sample.category.slug} has no attributes`);
    if (facet === undefined) return;
    const [option] = facet.options;
    if (option === undefined) return;

    await page.goto(`/c/${sample.category.slug}`);
    await expectNoBlockingA11yViolations(page);
    await page
      .getByRole('complementary', { name: 'Filters' })
      .getByRole('checkbox', { name: option.value, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`attr\\.${facet.code}=${option.code}`));
    await expect(page.getByRole('list', { name: 'Active filters' })).toContainText(
      `${facet.name}: ${option.value}`,
    );
    // Either matching products or the empty state with "Clear filters": never an error.
    await expect(listItems(page).first().or(page.getByText('No products match your search.'))).toBeVisible();
  });

  test('invalid URL values are dropped, never sent', async ({ page }) => {
    await page.goto('/search?sort=best-match&minPrice=abc&seller=not-a-uuid&attr.size=m');
    await expect(page.getByRole('heading', { level: 1, name: 'All products' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Active filters' })).toHaveCount(0);
    await expect(listItems(page).first()).toBeVisible();
  });
});
