// T-O4 (spec 01 SF-23, SF-23-A1, TK3-Q1): a signed-out visitor taps the heart on a product page, signs in on
// the way, and lands back on the product with it saved; the wishlist page lists it, and Remove empties it.
import { randomUUID } from 'node:crypto';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedProduct } from '../fixtures/catalog';

test('heart while signed out → sign in → saved → removed from the wishlist', async ({
  page,
  accounts,
  seller,
  customer,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const { slug } = await publishedProduct(accounts.backend, seller.accessToken, suffix);
  const productName = `E2E delivery ${suffix}`;

  await page.goto(`/p/${slug}`);
  await expect(page.getByRole('heading', { level: 1, name: productName })).toBeVisible();
  await page.getByRole('button', { name: 'Save to wishlist' }).click();

  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await page.getByLabel(/^Email/).fill(customer.email);
  await page.getByLabel(/^Password/).fill(customer.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Back on the product: saved once, and the intent dropped from the URL.
  const heart = page.getByRole('button', { name: 'Remove from wishlist' });
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Saved to your wishlist.', { exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/wishlist=/);
  await expectNoBlockingA11yViolations(page);

  await page.goto('/account/wishlist');
  await expect(page.getByRole('heading', { level: 1, name: 'Wishlist' })).toBeVisible();
  await expect(page.getByRole('link', { name: productName })).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('button', { name: `Remove ${productName} from your wishlist` }).click();
  await expect(
    page.getByText('Your wishlist is empty. Tap the heart on a product to save it here.'),
  ).toBeVisible();
});
