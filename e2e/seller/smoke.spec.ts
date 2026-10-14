import { E2E_APPS } from '../apps';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

// Smoke (T-B7): the production build serves its page, accessibly. Replaced by the seller journeys from phase d.
test('home page renders without serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(new RegExp(E2E_APPS.seller.title));
  await expect(page.getByRole('heading', { level: 1, name: E2E_APPS.seller.title })).toBeVisible();
  await expectNoBlockingA11yViolations(page);
});
