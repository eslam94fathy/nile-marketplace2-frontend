// T-K8 (spec 01 SF-22) against the real backend: "Sold by" on a product leads to the seller's public page,
// whose listing holds only that seller's products; an unknown seller is a 404.
import { randomUUID } from 'node:crypto';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedProduct } from '../fixtures/catalog';

test('the seller page from a product, with only that seller’s products', async ({
  page,
  accounts,
  seller,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const { slug } = await publishedProduct(accounts.backend, seller.accessToken, suffix);

  await page.goto(`/p/${slug}`);
  const sellerLink = page.getByText('Sold by').getByRole('link');
  const businessName = (await sellerLink.textContent()) ?? '';
  await sellerLink.click();

  await expect(page).toHaveURL(new RegExp(`/s/${seller.sellerId}$`));
  await expect(page.getByRole('heading', { level: 1, name: businessName })).toBeVisible();
  await expect(page.getByText(/^Selling on Nile since [A-Z][a-z]+ \d{4}$/)).toBeVisible();
  await expect(page.getByRole('link', { name: `E2E delivery ${suffix}` })).toBeVisible();
  // Every card on the page is this seller's.
  const sellers = await page.getByRole('article').getByText('Sold by').getByRole('link').allTextContents();
  expect(sellers.length).toBeGreaterThan(0);
  expect(new Set(sellers)).toEqual(new Set([businessName]));
  await expectNoBlockingA11yViolations(page);
});

test('an unknown seller is not found', async ({ page }) => {
  const response = await page.goto(`/s/${randomUUID()}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText("This seller isn't available.")).toBeVisible();
});
