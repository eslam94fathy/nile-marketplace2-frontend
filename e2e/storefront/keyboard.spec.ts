// T-I2 keyboard-only walkthrough of the customer workflows (C-1, C-2, C-4…C-8) against the real backend: skip
// link, sign-in, product, add to cart, checkout with cash on delivery, the order, and cancelling it. Set-up
// through the API (a seller's product, a deliverable address); every UI step by keyboard only.
import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { publishedProduct } from '../fixtures/catalog';
import { solidPng } from '../fixtures/images';
import { check, pickFile, press, tabTo, type } from '../fixtures/keyboard';
import { deliveredCodOrder } from '../fixtures/orders';
import { openTicket } from '../fixtures/returns';

test('customer journey by keyboard only', async ({ page, accounts, seller, customer }) => {
  test.slow();
  const { backend } = accounts;
  const { slug } = await publishedProduct(backend, seller.accessToken, randomUUID().slice(0, 8));
  const zones = expectData(
    await backend.request('GET', '/api/v1/governorates'),
    200,
  ) as Schema<'GovernorateDto'>[];
  const zone = zones.find((governorate) => governorate.isDeliverable);
  if (zone === undefined) throw new Error('No deliverable governorate: set a delivery fee as admin');
  expectData(
    await backend.request('POST', '/api/v1/me/addresses', {
      token: customer.accessToken,
      body: {
        label: 'Home',
        recipientName: 'Mona Adel',
        recipientPhone: '+201001234567',
        governorateId: zone.id,
        city: 'Nasr City',
        area: 'District 7',
        street: 'Abbas El Akkad',
        building: '12',
        isDefault: true,
      },
    }),
    201,
  );

  // The skip link is the first stop and moves focus to the main content.
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();

  // C-2 sign in, sent back to the product.
  await page.goto(`/login?returnTo=${encodeURIComponent(`/p/${slug}`)}`);
  await type(page, page.getByLabel(/^Email/), customer.email);
  await type(page, page.getByLabel(/^Password/), customer.password);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/p/${slug}`));

  // C-1 / C-4 the product's only variant is chosen already; add it to the cart.
  await press(page, page.getByRole('button', { name: 'Add to cart' }));
  await expect(page.getByText('Added to cart').first()).toBeVisible();
  await page.goto('/cart');
  await expectNoBlockingA11yViolations(page);
  await press(page, page.getByRole('link', { name: 'Proceed to checkout' }));

  // C-5 / C-6 checkout: the default address is chosen; pick cash on delivery and place the order.
  await expect(page).toHaveURL(/\/checkout$/);
  await check(
    page,
    page.getByRole('group', { name: 'Choose a payment method' }),
    page.getByRole('radio', { name: /Cash on delivery/ }),
  );
  await press(page, page.getByRole('button', { name: 'Place order' }));
  await expect(page).toHaveURL(/\/checkout\/confirmation\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/^Thank you\. Your order .+ is placed\.$/)).toBeVisible();

  // C-7 / C-8 the order, then cancelling the seller's items from its dialog.
  const orderId = page.url().split('/').at(-1) ?? '';
  await page.goto(`/account/orders/${orderId}`);
  const cancel = page.getByRole('button', { name: /^Cancel the items from / });
  await press(page, cancel);
  const dialog = page.getByRole('dialog', { name: 'Cancel these items' });
  await expect(dialog).toBeVisible();
  await type(page, dialog.getByRole('textbox', { name: 'Reason (optional)' }), 'Ordered by mistake');
  await press(page, dialog.getByRole('button', { name: 'Cancel items' }));
  await expect(dialog).toBeHidden();
  await expect(cancel).toHaveCount(0);
  // Focus is never lost to the page body after the dialog closes.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});

// T-O2: the Release 2 widgets by keyboard only (star rating, photo uploader, review photo lightbox, notification
// bell, support thread). Set-up through the API.

test('review with photos, its lightbox and the notification bell by keyboard only', async ({
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
  const { variantId, slug } = await publishedProduct(backend, seller.accessToken, suffix);
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
  const item = order.sellerOrders[0]?.items[0];
  if (item === undefined) throw new Error('order without items');

  // C-11 write a review: rating by arrows, two photos through the native picker.
  await page.goto(`/account/orders/${order.id}`);
  await press(page, page.getByRole('link', { name: `Write a review of ${item.productName}` }));
  await expect(page.getByRole('heading', { level: 1, name: 'Write a review' })).toBeVisible();
  await check(
    page,
    page.getByRole('group', { name: /^Rating/ }),
    page.getByRole('radio', { name: '4 stars' }),
  );
  await type(page, page.getByRole('textbox', { name: 'Title' }), `Keyboard ${suffix}`);
  await type(page, page.getByRole('textbox', { name: /^Review/ }), 'Written without a mouse.');
  const photos = page.getByLabel('Photos');
  await pickFile(page, photos, { name: 'one.png', mimeType: 'image/png', buffer: solidPng() });
  await pickFile(page, photos, {
    name: 'two.png',
    mimeType: 'image/png',
    buffer: solidPng(400, 400, [14, 42, 59]),
  });
  await expect(page.getByText('Ready', { exact: true })).toHaveCount(2, { timeout: 30_000 });
  await expectNoBlockingA11yViolations(page);
  await press(page, page.getByRole('button', { name: 'Publish review' }));
  await expect(page.getByText('Thanks, your review is published.', { exact: true })).toBeVisible();

  // Review photos open in the lightbox: arrows move, Escape closes, focus returns to the photo.
  await page.goto(`/p/${slug}`);
  const section = page.getByRole('region', { name: 'Reviews' });
  const first = section.getByRole('button', { name: 'Show photo 1 of 2' });
  await press(page, first);
  const lightbox = page.getByRole('dialog');
  await expect(lightbox.getByRole('status')).toHaveText('Photo 1 of 2');
  await page.keyboard.press('ArrowRight');
  await expect(lightbox.getByRole('status')).toHaveText('Photo 2 of 2');
  await expectNoBlockingA11yViolations(page);
  await page.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();
  await expect(first).toBeFocused();

  // X-2 the bell: Enter opens the panel (the delivery left notifications), Escape gives focus back, and its
  // settings link works from the keyboard.
  const bell = page.getByRole('button', { name: /^Notifications/ });
  await press(page, bell);
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  await expect(panel.getByRole('listitem').first()).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();
  await press(page, bell);
  await press(page, panel.getByRole('link', { name: 'Notification settings' }));
  await expect(page).toHaveURL(/\/account\/notifications\/settings$/);
});

test('support thread by keyboard only', async ({ page, signIn, accounts }) => {
  const customer = await signIn('storefront');
  const subject = `Keyboard ticket ${randomUUID().slice(0, 8)}`;
  const ticket = await openTicket(accounts.backend, customer.accessToken, subject);

  // X-4 reply in the thread: Ctrl+Enter sends, the box empties, focus stays in it.
  await page.goto(`/account/support/${ticket.id}`);
  const box = page.getByRole('textbox', { name: /^Your message/ });
  await type(page, box, 'Sent from the keyboard');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(
    page.getByRole('region', { name: 'Messages' }).getByText('Sent from the keyboard'),
  ).toBeVisible();
  await expect(box).toHaveValue('');
  await expect(box).toBeFocused();
  await expectNoBlockingA11yViolations(page);
  // The send button is reachable too.
  await tabTo(page, page.getByRole('button', { name: 'Send' }));
});
