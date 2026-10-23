// T-F2 against the real backend: a new customer with one item in the cart opens checkout, has no address
// yet (the form is inline), saves one in a deliverable governorate, and sees it selected with that
// governorate's delivery fee in the summary. Then an empty cart sends the customer back to the cart.
import type { Schema } from '@nile/api';
import type { Page } from '@playwright/test';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

type ProductDetail = Schema<'ProductDetailDto'>;
type Governorate = Schema<'GovernorateDto'>;

async function signInThroughForm(page: Page, email: string, password: string, returnTo: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('checkout: add the first address → selected → delivery fee shown', async ({
  page,
  accounts,
  customer,
}) => {
  const { backend } = accounts;
  const list = await backend.request('GET', '/api/v1/products?limit=40&inStock[eq]=true');
  let variantId: string | undefined;
  for (const item of (list.body as { data: { slug: string }[] }).data) {
    const detail = (await backend.request('GET', `/api/v1/products/${item.slug}`)).body as {
      data: ProductDetail;
    };
    variantId = detail.data.variants.find((v) => v.inStock)?.id;
    if (variantId !== undefined) break;
  }
  if (variantId === undefined)
    throw new Error('No product in stock: run the backend seed (npm run seed:dev)');
  const added = await backend.request('POST', '/api/v1/cart/items', {
    token: customer.accessToken,
    body: { variantId, quantity: 1 },
  });
  expect(added.status).toBe(201);

  const governorates = (
    (await backend.request('GET', '/api/v1/governorates')).body as { data: Governorate[] }
  ).data;
  const zone = governorates.find((g) => g.isDeliverable && typeof g.deliveryFee === 'string');
  const fee = zone?.deliveryFee;
  if (zone === undefined || fee === undefined || fee === null)
    throw new Error('No deliverable governorate: set a delivery fee as admin');

  await signInThroughForm(page, customer.email, customer.password, '/checkout');
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
  await expect(page.getByText('This will be your default address.')).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  await page.getByRole('textbox', { name: /^Label/ }).fill('Home');
  await page.getByRole('textbox', { name: /^Recipient name/ }).fill('Mona Adel');
  await page.getByRole('textbox', { name: /^Recipient phone/ }).fill('1001234567');
  await page.getByRole('combobox', { name: /^Governorate/ }).click();
  await page.getByRole('option', { name: zone.name, exact: true }).click();
  await page.getByRole('textbox', { name: /^City/ }).fill('Nasr City');
  await page.getByRole('textbox', { name: /^Area/ }).fill('District 7');
  await page.getByRole('textbox', { name: /^Street/ }).fill('Abbas El Akkad');
  await page.getByRole('textbox', { name: /^Building/ }).fill('12');
  await page.getByRole('button', { name: 'Save address' }).click();

  await expect(page.getByRole('radio', { name: /Home/ })).toBeChecked();
  const feeText = page.getByText('Delivery fee').locator('xpath=following-sibling::dd');
  await expect(feeText).toContainText(Number(fee).toFixed(2));
  await expectNoBlockingA11yViolations(page);

  // Entry guard: an emptied cart sends the customer back to it.
  expect(
    (await backend.request('DELETE', '/api/v1/cart', { token: customer.accessToken })).status,
  ).toBeLessThan(300);
  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByText('Your cart is empty.')).toBeVisible();
});
