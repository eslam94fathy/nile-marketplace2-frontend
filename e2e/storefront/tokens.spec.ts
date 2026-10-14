import { CONTRAST_PAIRS, SEMANTIC_COLORS } from '@nile/ui/tokens';
import { TOKEN_PAGE_PATH } from '../apps';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

// T-C1 visual sanity: the tokens reach the browser through Tailwind (computed colours, Inter), the page is
// accessible, and a full-page screenshot is attached to the report for review. No pixel baseline: those
// differ per OS, and the CI E2E job only starts in phase d.
const rgb = (hex: string): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff})`;
};

test('token page renders the tokens through the theme', async ({ page }, testInfo) => {
  await page.goto(TOKEN_PAGE_PATH);
  await expect(page.getByRole('heading', { level: 1, name: 'Design tokens' })).toBeVisible();

  const body = page.locator('body');
  await expect(body).toHaveCSS('background-color', rgb(SEMANTIC_COLORS.background));
  await expect(body).toHaveCSS('color', rgb(SEMANTIC_COLORS.foreground));
  await expect(page.locator('html')).toHaveCSS('font-family', /Inter/);

  const primarySwatch = page
    .getByRole('listitem')
    .filter({ hasText: /^primary#/ })
    .locator('span')
    .first();
  await expect(primarySwatch).toHaveCSS('background-color', rgb(SEMANTIC_COLORS.primary));

  await expect(page.getByRole('table').getByRole('row')).toHaveCount(CONTRAST_PAIRS.length + 1);
  await expectNoBlockingA11yViolations(page);

  await testInfo.attach('token-page', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
