// T-O4 cross-role flow (TO-Q4; spec 03 AD-27, spec 02 SE-08, TL1-Q3): the admin blocks a seller's published
// product with a reason; it leaves the store at once; the seller sees it blocked with the reason and can't
// publish it; the admin unblocks it and it stays unpublished.
import { randomUUID } from 'node:crypto';
import { appUrl } from '../apps';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedProduct } from '../fixtures/catalog';
import { signInAs } from '../fixtures/sessions';

const ADMIN = appUrl('admin');
const SELLER = appUrl('seller');
const STOREFRONT = appUrl('storefront');

test('admin blocks a product → hidden from the store → seller sees it blocked', async ({
  page,
  context,
  accounts,
  admin,
}) => {
  test.slow();
  const seller = await accounts.seller({ approved: true });
  const suffix = randomUUID().slice(0, 8);
  const name = `E2E delivery ${suffix}`;
  const reason = `Counterfeit listing ${suffix}`;
  const { productId, slug } = await publishedProduct(accounts.backend, seller.accessToken, suffix);

  // Admin (AD-27).
  await signInAs(context, 'admin', admin);
  await page.goto(`${ADMIN}/products/${productId}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await page.getByRole('button', { name: 'Block', exact: true }).click();
  const block = page.getByRole('dialog', { name: 'Block product' });
  await block.getByRole('textbox', { name: /^Reason/ }).fill(reason);
  await block.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(page.getByText(`${name} is blocked.`, { exact: true })).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  // Storefront: the product page is gone.
  const response = await page.goto(`${STOREFRONT}/p/${slug}`);
  expect(response?.status()).toBe(404);

  // Seller (SE-08): the banner with the reason; Publish / Unpublish locked.
  await signInAs(context, 'seller', seller);
  await page.goto(`${SELLER}/products/${productId}`);
  await expect(page.getByText('Blocked by Nile').first()).toBeVisible();
  await expect(page.getByText(`Nile blocked this product: ${reason}.`, { exact: false })).toBeVisible();
  await expect(page.getByText("The status can't be changed while Nile blocks this product.")).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  // Admin: unblock; the product stays unpublished until the seller publishes it.
  await page.goto(`${ADMIN}/products/${productId}`);
  await page.getByRole('button', { name: 'Unblock' }).click();
  await page
    .getByRole('dialog', { name: 'Unblock product' })
    .getByRole('button', { name: 'Unblock' })
    .click();
  await expect(page.getByText(`${name} is no longer blocked.`, { exact: true })).toBeVisible();
});
