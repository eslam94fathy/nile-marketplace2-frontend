// T-K5 journey (spec 01 SF-18, SF-24, SF-25) against the real backend: a delivered COD order (through the
// API), "Write a review" from the order page, a rating, text and one photo uploaded to the media storage
// (MinIO locally, the first E2E upload: CLAUDE.md §14.1at), then the review on SF-24 and on the product page.
import { randomUUID } from 'node:crypto';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedVariant } from '../fixtures/catalog';
import { solidPng } from '../fixtures/images';
import { deliveredCodOrder } from '../fixtures/orders';

test('write a review with a photo from a delivered order', async ({
  page,
  signIn,
  accounts,
  admin,
  seller,
  agent,
}) => {
  test.slow();
  const customer = await signIn('storefront');
  const { backend } = accounts;
  const suffix = randomUUID().slice(0, 8);
  const variantId = await publishedVariant(backend, seller.accessToken, suffix);
  const order = await deliveredCodOrder(
    backend,
    {
      customer: customer.accessToken,
      seller: seller.accessToken,
      admin: admin.accessToken,
      agent: agent.accessToken,
    },
    agent.agentId,
    variantId,
  );

  await page.goto(`/account/orders/${order.id}`);
  const item = order.sellerOrders[0]?.items[0];
  if (item === undefined) throw new Error('order without items');
  await page.getByRole('link', { name: `Write a review of ${item.productName}` }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Write a review' })).toBeVisible();
  await page.getByRole('radio', { name: '5 stars' }).check({ force: true });
  await page.getByRole('textbox', { name: 'Title' }).fill(`Great ${suffix}`);
  await page.getByRole('textbox', { name: /^Review/ }).fill('Arrived quickly and fits well.');
  await page
    .getByLabel('Photos')
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: solidPng() });
  await expect(page.getByText('Ready', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('button', { name: 'Publish review' }).click();

  await expect(page.getByText('Thanks, your review is published.')).toBeVisible();
  await expect(page).toHaveURL(/\/account\/reviews\?tab=written$/);
  const written = page.getByRole('article').filter({ hasText: `Great ${suffix}` });
  await expect(written.getByText('Rated 5 out of 5')).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  // On the product page the review shows with its photo.
  await written.getByRole('link', { name: item.productName }).click();
  const section = page.getByRole('region', { name: 'Reviews' });
  await expect(section.getByRole('heading', { name: `Great ${suffix}` })).toBeVisible();
  await expect(section.getByRole('button', { name: 'Show photo 1 of 1' })).toBeVisible();
});
