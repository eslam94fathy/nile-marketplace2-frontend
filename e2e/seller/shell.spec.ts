import { expect, expectNavigation, shellTests, test, VIEWPORTS } from '../fixtures/shell';

// T-C3 seller shell (spec 02 §2.1): sidebar on desktop, bottom-sheet menu on mobile.
const NAV = 'Seller portal';

shellTests('seller');

test('desktop sidebar navigates and marks the current page', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/');
  await expectNavigation(page, NAV, 'Products', 'Products');
  await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible();
});

test('mobile menu opens as a sheet, navigates and closes', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu' }).click();
  const sheet = page.getByRole('dialog', { name: 'Menu' });
  await sheet.getByRole('link', { name: 'Orders' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible();
  await expect(sheet).toHaveCount(0);
});
