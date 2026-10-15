import { expect, shellTests, test, VIEWPORTS } from '../fixtures/shell';

// T-C3 storefront shell (spec 01 §2): header, footer, search rules, signed-out account area.
shellTests('storefront');

test('search needs 2 characters, trims, and submits to /search', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('banner').getByRole('search');
  const submit = search.getByRole('button', { name: 'Search' });
  await search.getByRole('searchbox', { name: 'Search products' }).fill(' a ');
  await expect(submit).toBeDisabled();
  await expect(search.getByText('Type at least 2 characters')).toBeVisible();
  await search.getByRole('searchbox', { name: 'Search products' }).fill('  phone ');
  await submit.click();
  await expect(page).toHaveURL(/\/search\?q=phone$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
});

test('signed-out links carry returnTo; cart asks to sign in first', async ({ page }) => {
  await page.goto('/design/tokens');
  const account = page.getByRole('navigation', { name: 'Account' });
  await expect(account.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/login?returnTo=%2Fdesign%2Ftokens',
  );
  await expect(account.getByRole('link', { name: 'Cart' })).toHaveAttribute(
    'href',
    '/login?returnTo=%2Fcart',
  );
});

test('categories drawer opens from the header on phones', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('/');
  await page.getByRole('button', { name: 'Categories' }).click();
  await expect(page.getByRole('dialog', { name: 'Categories' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('footer links work; "Your orders" asks a visitor to sign in first (T-D3)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Your orders' }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Faccount%2Forders$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
});
