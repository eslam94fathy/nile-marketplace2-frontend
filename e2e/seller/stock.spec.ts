// T-H3 journey (spec 02 SE-12, SE-13) against the real backend: adjust a variant's stock from the product
// page, then find the adjustment in its stock history.
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { createProductWithVariant } from '../fixtures/catalog';

test('adjust stock (add, then set the counted number) → history shows both', async ({ page, signIn }) => {
  test.slow();
  await signIn('seller');
  const { product, variant } = await createProductWithVariant(page, 5);

  await page.goto(`/products/${product.id}`);
  await page
    .getByRole('button', { name: `Adjust stock of ${variant.sku}` })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: `Adjust stock · ${variant.sku}` });
  await dialog.getByLabel(/^Quantity/).fill('3');
  await expect(dialog.getByText('This will add 3 units (on hand 5 → 8).')).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await dialog.getByRole('button', { name: 'Adjust stock' }).click();
  await expect(page.getByText('Stock updated.', { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);

  await page
    .getByRole('button', { name: `Adjust stock of ${variant.sku}` })
    .first()
    .click();
  await dialog.getByRole('radio', { name: 'Set on-hand count to…' }).check();
  await dialog.getByLabel(/^On-hand count/).fill('6');
  await expect(dialog.getByText('This will remove 2 units (on hand 8 → 6).')).toBeVisible();
  await dialog.getByRole('button', { name: 'Adjust stock' }).click();
  await expect(dialog).toHaveCount(0);

  await page
    .getByRole('link', { name: `Stock history of ${variant.sku}` })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: `Stock history · ${variant.sku}` })).toBeVisible();
  const table = page.getByRole('table', { name: 'Stock movements' });
  await expect(table.getByRole('cell', { name: '-2', exact: true })).toBeVisible();
  await expect(table.getByRole('cell', { name: '+3', exact: true })).toBeVisible();
  // The initial stock may or may not be a movement of its own, so only the two adjustments are checked.
  await expect(table.getByText('Stock adjusted by you').first()).toBeVisible();
  await expectNoBlockingA11yViolations(page);
});
