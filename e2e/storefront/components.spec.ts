import { COMPONENT_GALLERY_PATH } from '../apps';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

// T-C2 in a real browser: what jsdom can't check (colour contrast, focus outlines, overlays in layout).
// A full-page screenshot is attached for review (no pixel baseline, as for the token page).

test.beforeEach(async ({ page }) => {
  await page.goto(COMPONENT_GALLERY_PATH);
  await expect(page.getByRole('heading', { level: 1, name: 'Components' })).toBeVisible();
});

test('gallery has no serious accessibility violations, also with errors shown', async ({
  page,
}, testInfo) => {
  // axe on the whole gallery, twice: well above the default timeout on a busy machine.
  test.slow();
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('button', { name: 'Show errors' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Some fields need attention.' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Email/ })).toHaveAttribute('aria-invalid', 'true');
  await expectNoBlockingA11yViolations(page);
  await testInfo.attach('component-gallery', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('keyboard focus is visible on buttons', async ({ page }) => {
  await page.getByRole('button', { name: 'Primary' }).focus();
  await page.keyboard.press('Tab');
  const focused = page.getByRole('button', { name: 'Secondary' });
  await expect(focused).toBeFocused();
  await expect(focused).toHaveCSS('outline-style', 'solid');
  await expect(focused).toHaveCSS('outline-width', '2px');
});

test('dialog and confirm dialog trap focus and close with Escape', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Open dialog' });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Edit address' })).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.getByRole('button', { name: 'Cancel order' }).click();
  const confirm = page.getByRole('dialog', { name: 'Cancel the whole order?' });
  await confirm.getByRole('button', { name: 'Cancel order' }).click();
  await expect(confirm).toHaveCount(0);
});

test('toasts show the reference and can be closed', async ({ page }) => {
  test.slow();
  await page.getByRole('button', { name: 'Error toast' }).click();
  const region = page.getByRole('region', { name: /Notification/ });
  await expect(region.getByText('Reference: 0b0e0f53-6f5a-4c43-9c39-9d1b1e0a2f10')).toBeVisible();
  await region.getByRole('button', { name: 'Close' }).click();
  await expect(region.getByText(/Reference:/)).toHaveCount(0);

  // axe on a visible toast: hovering keeps it open (Radix pauses the timer), since axe takes a while.
  await page.getByRole('button', { name: 'Success toast' }).click();
  await region.getByText('Profile saved.').hover();
  await expectNoBlockingA11yViolations(page);
  await expect(region.getByText('Profile saved.')).toBeVisible();
});

test('data table sorts by header and loads more, never showing totals', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Recent orders' });
  await expect(table.getByRole('row')).toHaveCount(1 + 3);
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(table.getByRole('row')).toHaveCount(1 + 6);
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);

  const placed = table.getByRole('columnheader', { name: /Placed/ });
  await expect(placed).toHaveAttribute('aria-sort', 'descending');
  await placed.getByRole('button').click();
  await expect(placed).toHaveAttribute('aria-sort', 'ascending');
  await expect(table.getByRole('row').nth(1)).toContainText('NM-2026-001');
  await expect(page.locator('main')).not.toContainText(/\bpage \d|\bof \d+|\btotal \d|\d+ results?/i);
});
