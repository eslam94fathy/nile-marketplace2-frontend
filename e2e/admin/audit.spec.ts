// T-O4 (spec 03 AD-38, AD-39, TM10): an admin action (a product blocked through the API) appears in the audit
// log: AD-27 "History" opens the log filtered to the product, the entry shows its reason, and AD-39 its changes.
import { randomUUID } from 'node:crypto';
import { expectData } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedProduct } from '../fixtures/catalog';
import { currentToken } from '../fixtures/sessions';

test('a blocked product leaves an audit entry with its changes', async ({
  page,
  context,
  signIn,
  accounts,
  seller,
}) => {
  await signIn('admin');
  const suffix = randomUUID().slice(0, 8);
  const reason = `Audit check ${suffix}`;
  const { productId } = await publishedProduct(accounts.backend, seller.accessToken, suffix);
  expectData(
    await accounts.backend.request('POST', `/api/v1/admin/products/${productId}/block`, {
      token: await currentToken(context, 'admin'),
      body: { reason },
    }),
    200,
  );

  await page.goto(`/products/${productId}`);
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === '/audit' && url.searchParams.get('targetId') === productId,
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: reason });
  await expect(row).toContainText('Product blocked');
  await expect(row).toContainText('You');
  await expectNoBlockingA11yViolations(page);

  await row.getByRole('link', { name: 'Product blocked' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Product blocked' })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Recorded fields before and after the change' }),
  ).toBeVisible();
  await expect(page.getByLabel('Entry details')).toContainText(reason);
  await expectNoBlockingA11yViolations(page);
});
