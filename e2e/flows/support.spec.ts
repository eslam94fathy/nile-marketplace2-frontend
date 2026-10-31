// T-O4 cross-role flow (TO-Q4; spec 01 SF-29…SF-31, spec 03 AD-28, AD-29): the customer opens a ticket in the
// storefront; the admin finds it in the support console and replies; the customer's open thread shows the reply
// live (socket), without a reload. Two pages of one browser context, one per app.
import { randomUUID } from 'node:crypto';
import { appUrl } from '../apps';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { signInAs } from '../fixtures/sessions';

const STOREFRONT = appUrl('storefront');
const ADMIN = appUrl('admin');
/** Socket delivery plus the thread's refetch. */
const LIVE_WAIT_MS = 15_000;

test('customer ticket → admin reply in the console → shown live to the customer', async ({
  page,
  context,
  accounts,
  admin,
}) => {
  test.slow();
  const customer = await accounts.customer();
  const subject = `Flow question ${randomUUID().slice(0, 8)}`;

  // Customer (SF-30): a new ticket without an order.
  await signInAs(context, 'storefront', customer);
  await page.goto(`${STOREFRONT}/account/support/new`);
  await page.getByRole('combobox', { name: /^Category/ }).click();
  await page.getByRole('option', { name: 'Other' }).click();
  await page.getByRole('textbox', { name: /^Subject/ }).fill(subject);
  await page.getByRole('textbox', { name: /^Message/ }).fill('Can I change my delivery address?');
  await page.getByRole('button', { name: 'Send ticket' }).click();
  await expect(page).toHaveURL(/\/account\/support\/[0-9a-f-]{36}$/);
  const ticketId = page.url().split('/').at(-1) ?? '';
  const customerMessages = page.getByRole('region', { name: 'Messages' });
  await expect(customerMessages.getByText('Can I change my delivery address?')).toBeVisible();

  // Admin (AD-28 → AD-29): the ticket is in the "New" view; open it and reply.
  await signInAs(context, 'admin', admin);
  const adminPage = await context.newPage();
  await adminPage.goto(`${ADMIN}/support`);
  await adminPage.getByRole('link', { name: subject }).click();
  await expect(adminPage).toHaveURL(`${ADMIN}/support/${ticketId}`);
  await expect(adminPage.getByText('Replying assigns this ticket to you.')).toBeVisible();
  await adminPage
    .getByRole('textbox', { name: /^Reply to the user/ })
    .fill('Yes, reply with the new address.');
  await adminPage.getByRole('button', { name: 'Send' }).click();
  await expect(
    adminPage.getByRole('region', { name: 'Messages' }).getByText('Yes, reply with the new address.'),
  ).toBeVisible();
  await expectNoBlockingA11yViolations(adminPage);

  // Customer: the reply arrives on the open thread, signed "Nile Support".
  await page.bringToFront();
  await expect(customerMessages.getByText('Yes, reply with the new address.')).toBeVisible({
    timeout: LIVE_WAIT_MS,
  });
  await expect(customerMessages.getByText('Nile Support').first()).toBeVisible();
  await expectNoBlockingA11yViolations(page);
});
