// T-O4 (spec 03 AD-30, AD-31, TM6): a customer's review (through the API) found from its product's filter, hidden
// with a reason, gone from the storefront, then shown again.
import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedProduct } from '../fixtures/catalog';
import { publishedReview } from '../fixtures/reviews';

test('hide a review with a reason, then show it again', async ({
  page,
  signIn,
  accounts,
  customer,
  seller,
  admin,
  agent,
}) => {
  test.slow();
  await signIn('admin');
  const { backend } = accounts;
  const suffix = randomUUID().slice(0, 8);
  const { variantId, productId } = await publishedProduct(backend, seller.accessToken, suffix);
  const title = `Rude ${suffix}`;
  const review = await publishedReview(
    backend,
    {
      customer: customer.accessToken,
      seller: seller.accessToken,
      admin: admin.accessToken,
      agent: agent.accessToken,
    },
    agent.agentId,
    variantId,
    { rating: 1, title, body: 'Contains a phone number.' },
  );
  const publicReviews = async () =>
    (
      expectData(
        await backend.request('GET', `/api/v1/products/${productId}/reviews`),
        200,
      ) as Schema<'ReviewDto'>[]
    ).map((item) => item.id);

  await page.goto(`/reviews?product=${productId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Reviews' })).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('link', { name: title }).click();
  await expect(page).toHaveURL(`/reviews/${review.id}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

  await page.getByRole('button', { name: 'Hide review' }).click();
  const hide = page.getByRole('dialog', { name: 'Hide review' });
  await hide.getByRole('textbox', { name: /^Reason/ }).fill('Personal data in the text.');
  await hide.getByRole('button', { name: 'Hide review' }).click();
  await expect(page.getByText('The review is hidden.', { exact: true })).toBeVisible();
  await expect(page.getByText('Personal data in the text.')).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  expect(await publicReviews()).not.toContain(review.id);

  await page.getByRole('button', { name: 'Show review' }).click();
  await page
    .getByRole('dialog', { name: 'Show review' })
    .getByRole('button', { name: 'Show review' })
    .click();
  await expect(page.getByText('The review is published again.', { exact: true })).toBeVisible();
  expect(await publicReviews()).toContain(review.id);
});
