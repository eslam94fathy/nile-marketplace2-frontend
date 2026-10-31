// T-O4 (spec 02 SE-20, TL4): a customer's review of this seller's product (through the API); the seller finds it
// under "Not replied", replies once, and the reply shows under the review (and on the storefront product page).
import { randomUUID } from 'node:crypto';
import { appUrl } from '../apps';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedProduct } from '../fixtures/catalog';
import { publishedReview } from '../fixtures/reviews';
import { currentToken } from '../fixtures/sessions';

test('reply to a review of my product', async ({
  page,
  context,
  signIn,
  accounts,
  customer,
  admin,
  agent,
}) => {
  test.slow();
  await signIn('seller');
  const sellerToken = await currentToken(context, 'seller');
  const suffix = randomUUID().slice(0, 8);
  const { variantId, slug } = await publishedProduct(accounts.backend, sellerToken, suffix);
  const title = `Solid ${suffix}`;
  await publishedReview(
    accounts.backend,
    {
      customer: customer.accessToken,
      seller: sellerToken,
      admin: admin.accessToken,
      agent: agent.accessToken,
    },
    agent.agentId,
    variantId,
    { rating: 4, title, body: 'Good value, slow delivery.' },
  );

  await page.goto('/reviews');
  await expect(page.getByRole('heading', { level: 1, name: 'Reviews' })).toBeVisible();
  await page.getByRole('button', { name: 'Not replied' }).click();
  const review = page.getByRole('article').filter({ hasText: title });
  await expect(review).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  await review.getByRole('button', { name: /^Reply to / }).click();
  await expect(review.getByText("You can reply once and can't edit it later.")).toBeVisible();
  const reply = `Thanks, we are faster now ${suffix}.`;
  await review.getByRole('textbox', { name: /^Your reply/ }).fill(reply);
  await review.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.getByText('Reply sent.', { exact: true })).toBeVisible();
  await expect(review.getByText(reply)).toBeVisible();
  await expect(review.getByRole('button', { name: /^Reply to / })).toHaveCount(0);
  await expectNoBlockingA11yViolations(page);

  // Customers see the seller's reply under the review.
  await page.goto(`${appUrl('storefront')}/p/${slug}`);
  const section = page.getByRole('region', { name: 'Reviews' });
  await expect(section.getByText(reply)).toBeVisible();
});
