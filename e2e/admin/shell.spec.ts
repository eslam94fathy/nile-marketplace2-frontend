import { expect, expectNavigation, shellTests, test, VIEWPORTS } from '../fixtures/shell';

// T-C3 admin shell (spec 03 §2.1): grouped sidebar from 1024 px, menu sheet below, phone note.
const NAV = 'Admin console';
const PHONE_NOTE = 'The admin console works best on a larger screen.';

shellTests('admin');

test('desktop sidebar navigates within groups', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/');
  await expectNavigation(page, NAV, 'COD remittances', 'COD remittances');
  await expectNavigation(page, NAV, 'Delivery settings', 'Delivery settings');
  await expect(page.getByText(PHONE_NOTE)).toBeHidden();
});

test('phones see the larger-screen note and a working menu', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('/');
  await expect(page.getByText(PHONE_NOTE)).toBeVisible();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Sellers' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sellers' })).toBeVisible();
});

test('the account area links to Security', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Security' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Security' })).toBeVisible();
});
