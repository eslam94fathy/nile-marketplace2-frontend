import { expect, expectNavigation, shellTests, test, VIEWPORTS } from '../fixtures/shell';

// T-C3 agent shell (spec 04 §2.1): top bar with the shift switch, bottom navigation with 48 px targets.
const NAV = 'Delivery app';

shellTests('agent');

test('bottom navigation reaches every section with large targets', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto('/');
  for (const name of ['History', 'Finance', 'Me', 'Shipments']) {
    const link = page.getByRole('navigation', { name: NAV }).getByRole('link', { name, exact: true });
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    await expectNavigation(page, NAV, name, name);
  }
});

test('shift switch is shown (disabled until T-H12)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('switch', { name: 'Off shift' })).toBeDisabled();
});
