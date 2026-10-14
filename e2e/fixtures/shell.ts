import type { Page, TestInfo } from '@playwright/test';
import { E2E_APPS, VIEWPORTS, type E2eAppName } from '../apps';
import { expect, expectNoBlockingA11yViolations, test } from './index';

// Shared shell checks (T-C3): every app at 360 / 768 / 1280 px — landmarks, skip link, no sideways scroll,
// axe — plus a not-found page. A screenshot per viewport is attached for review (no pixel baseline).

const SKIP_LINK = 'Skip to main content';

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page wider than the viewport').toBeLessThanOrEqual(0);
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
}

export function shellTests(app: E2eAppName): void {
  const { title, landing } = E2E_APPS[app];

  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`shell at ${name} (${viewport.width} px): landmarks, skip link, accessible`, async ({
      page,
    }, testInfo) => {
      test.slow(); // axe on a full page, on a machine running four servers
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page).toHaveTitle(new RegExp(title));
      await expect(page.getByRole('heading', { level: 1, name: landing })).toBeVisible();
      await expect(page.getByRole('banner')).toBeVisible();
      await expect(page.getByRole('main')).toHaveCount(1);

      // The skip link is the first stop and moves focus to <main>.
      await page.keyboard.press('Tab');
      const skip = page.getByRole('link', { name: SKIP_LINK });
      await expect(skip).toBeFocused();
      await expect(skip).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();

      await expectNoHorizontalScroll(page);
      await expectNoBlockingA11yViolations(page);
      await attachScreenshot(page, testInfo, `${app}-${name}`);
    });
  }

  test('unknown URLs show the not-found page with a way home', async ({ page }) => {
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Go to the home page' }).click();
    await expect(page.getByRole('heading', { level: 1, name: landing })).toBeVisible();
  });
}

/** Clicks a navigation link and checks the destination's heading and the active link. */
export async function expectNavigation(
  page: Page,
  navName: string,
  linkName: string,
  heading: string,
): Promise<void> {
  const nav = page.getByRole('navigation', { name: navName });
  await nav.getByRole('link', { name: linkName, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: navName }).getByRole('link', { name: linkName, exact: true }),
  ).toHaveAttribute('aria-current', 'page');
}

export { expect, test, VIEWPORTS };
