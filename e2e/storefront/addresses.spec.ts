// T-G2 against the real backend: a new customer adds two addresses (the first becomes the default), edits
// one, makes the second the default, then deletes it; the list always matches `GET /me/addresses`.
import type { Schema } from '@nile/api';
import type { Locator, Page } from '@playwright/test';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

type Governorate = Schema<'GovernorateDto'>;

async function signInThroughForm(page: Page, email: string, password: string, returnTo: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function fillAddress(page: Page, dialog: Locator, label: string, governorate: string) {
  await dialog.getByRole('textbox', { name: /^Label/ }).fill(label);
  await dialog.getByRole('textbox', { name: /^Recipient name/ }).fill('Mona Adel');
  await dialog.getByRole('textbox', { name: /^Recipient phone/ }).fill('1001234567');
  await dialog.getByRole('combobox', { name: /^Governorate/ }).click();
  await page.getByRole('option', { name: governorate, exact: true }).click();
  await dialog.getByRole('textbox', { name: /^City/ }).fill('Nasr City');
  await dialog.getByRole('textbox', { name: /^Area/ }).fill('District 7');
  await dialog.getByRole('textbox', { name: /^Street/ }).fill('Abbas El Akkad');
  await dialog.getByRole('textbox', { name: /^Building/ }).fill('12');
  await dialog.getByRole('button', { name: 'Save address' }).click();
  await expect(dialog).toBeHidden();
}

test('address book: add → edit → make default → delete', async ({ page, accounts, customer }) => {
  const governorates = (
    (await accounts.backend.request('GET', '/api/v1/governorates')).body as { data: Governorate[] }
  ).data;
  const zone = governorates.find((g) => g.isDeliverable && typeof g.deliveryFee === 'string');
  if (zone === undefined) throw new Error('No deliverable governorate: set a delivery fee as admin');

  await signInThroughForm(page, customer.email, customer.password, '/account/addresses');
  await expect(page.getByText("You haven't saved any addresses yet.")).toBeVisible();
  await expectNoBlockingA11yViolations(page);

  await page.getByRole('button', { name: 'Add address' }).click();
  const add = page.getByRole('dialog', { name: 'Add address' });
  await expect(add.getByText('This will be your default address.')).toBeVisible();
  await fillAddress(page, add, 'Home', zone.name);

  await page.getByRole('button', { name: 'Add address' }).click();
  await fillAddress(page, page.getByRole('dialog', { name: 'Add address' }), 'Work', zone.name);
  const cards = page.getByRole('listitem');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('Home');
  await expect(cards.first()).toContainText('Default');
  await expectNoBlockingA11yViolations(page);

  await page.getByRole('button', { name: 'Edit Work' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit address' });
  await edit.getByRole('textbox', { name: /^Floor/ }).fill('4');
  await edit.getByRole('button', { name: 'Save address' }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByRole('listitem').filter({ hasText: 'Work' })).toContainText('Floor 4');

  await page.getByRole('button', { name: 'Make Work the default' }).click();
  await expect(page.getByRole('button', { name: 'Make Home the default' })).toBeVisible();
  await expect(cards.first()).toContainText('Work');

  await page.getByRole('button', { name: 'Delete Work' }).click();
  await page.getByRole('dialog', { name: 'Delete address' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Choose a default address.')).toBeVisible();
  await expect(cards).toHaveCount(1);

  const saved = (
    (await accounts.backend.request('GET', '/api/v1/me/addresses', { token: customer.accessToken })).body as {
      data: Schema<'AddressDto'>[];
    }
  ).data;
  expect(saved.map((a) => [a.label, a.isDefault])).toEqual([['Home', false]]);
});
