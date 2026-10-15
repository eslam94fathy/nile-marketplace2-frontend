// T-E1 against the real backend: category navigation from the home tiles, the header menu (desktop dropdown,
// phone drawer) and the category pages (breadcrumbs, subcategory chips); unknown slugs are 404. The test reads
// the live tree and picks a path three levels deep, so it works with whatever categories exist.
import type { Schema } from '@nile/api';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { VIEWPORTS } from '../apps';

type Node = Schema<'CategoryNodeDto'>;

/** The first root → child → grandchild path in the tree. */
function threeLevels(tree: readonly Node[]): [Node, Node, Node] {
  for (const root of tree) {
    for (const child of root.children) {
      const [grandchild] = child.children;
      if (grandchild !== undefined) return [root, child, grandchild];
    }
  }
  throw new Error('The backend has no three-level category path: run the backend seed (npm run seed:dev)');
}

test.describe('category navigation', () => {
  let path: [Node, Node, Node];

  test.beforeAll(async ({ accounts }) => {
    const response = await accounts.backend.request('GET', '/api/v1/categories');
    path = threeLevels((response.body as { data: Node[] }).data);
  });

  test('home tile → category page with chips → subcategory → breadcrumbs back up', async ({ page }) => {
    const [root, child, grandchild] = path;
    await page.goto('/');
    const tiles = page.getByRole('region', { name: 'Shop by category' });
    await tiles.getByRole('link', { name: root.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${root.slug}$`));
    await expect(page.getByRole('heading', { level: 1, name: root.name })).toBeVisible();
    await expectNoBlockingA11yViolations(page);

    await page
      .getByRole('navigation', { name: 'Subcategories' })
      .getByRole('link', { name: child.name, exact: true })
      .click();
    await page
      .getByRole('navigation', { name: 'Subcategories' })
      .getByRole('link', { name: grandchild.name, exact: true })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: grandchild.name })).toBeVisible();

    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    // Each item after Home starts with the "›" separator; compare the names.
    const names = (await breadcrumb.getByRole('listitem').allTextContents()).map((text) =>
      text.replace('›', '').trim(),
    );
    expect(names).toEqual(['Home', root.name, child.name, grandchild.name]);
    await expect(breadcrumb.getByText(grandchild.name, { exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await breadcrumb.getByRole('link', { name: root.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${root.slug}$`));
  });

  test('desktop header menu opens a category', async ({ page }) => {
    const [root, child] = path;
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto('/');
    await page.getByRole('banner').getByRole('button', { name: 'Categories' }).click();
    await page.getByRole('menuitem', { name: child.name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: child.name })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(root.name);
  });

  test('phone drawer expands to the third level', async ({ page }) => {
    const [root, child, grandchild] = path;
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto('/');
    await page.getByRole('banner').getByRole('button', { name: 'Categories' }).click();
    const drawer = page.getByRole('dialog', { name: 'Categories' });
    await drawer.getByRole('button', { name: `Show subcategories of ${root.name}` }).click();
    await drawer.getByRole('button', { name: `Show subcategories of ${child.name}` }).click();
    await drawer.getByRole('link', { name: grandchild.name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: grandchild.name })).toBeVisible();
    await expect(drawer).toHaveCount(0);
  });

  test('an unknown category is a 404 page', async ({ page }) => {
    const response = await page.goto('/c/no-such-category-e2e');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });
});
