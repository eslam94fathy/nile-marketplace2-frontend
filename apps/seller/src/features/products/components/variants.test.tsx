// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import { mockApi, sellerProductFactory, sellerVariantFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { ProductView } from './product-view';
import {
  CATEGORY_ID,
  chosen,
  COLOR,
  OTHER_CATEGORY_ID,
  serveCatalog,
  serveProfile,
  SIZE,
} from './products.fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const server = setupMswServer();

type Product = Schema<'SellerProductDetailDto'>;

const S_RED = sellerVariantFactory({
  sku: 'SH-S-RED',
  isDefault: false,
  options: [chosen(SIZE, 0), chosen(COLOR, 0)],
});
const SHIRT = sellerProductFactory({ name: 'Linen shirt', categoryId: CATEGORY_ID, variants: [S_RED] });

function serveProduct(product: Product) {
  const state = { calls: 0 };
  server.use(
    mockApi(
      'get',
      '/seller/products/{productId}',
      ({ reply }) => {
        state.calls += 1;
        return reply.ok(product);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

type Answer =
  'ok' | { readonly status: number; readonly code: ErrorCode; readonly details?: { value: string }[] };

function serveCreate(answer: Answer = 'ok') {
  const bodies: Schema<'CreateVariantDto'>[] = [];
  server.use(
    mockApi(
      'post',
      '/seller/products/{productId}/variants',
      async ({ request, reply }) => {
        const body = (await request.json()) as Schema<'CreateVariantDto'>;
        bodies.push(body);
        if (answer !== 'ok') {
          return reply.error(answer.status, answer.code, {
            details: (answer.details ?? []).map((detail) => ({
              field: 'optionIds',
              constraint: 'unknown',
              message: 'invalid',
              ...detail,
            })),
          });
        }
        return reply.created(sellerVariantFactory({ sku: body.sku }));
      },
      { base: BFF_BASE },
    ),
  );
  return bodies;
}

function serveUpdate(answer: Answer = 'ok') {
  const bodies: Schema<'UpdateVariantDto'>[] = [];
  server.use(
    mockApi(
      'patch',
      '/seller/products/{productId}/variants/{variantId}',
      async ({ request, reply }) => {
        const body = (await request.json()) as Schema<'UpdateVariantDto'>;
        bodies.push(body);
        return answer === 'ok' ? reply.ok(sellerVariantFactory()) : reply.error(answer.status, answer.code);
      },
      { base: BFF_BASE },
    ),
  );
  return bodies;
}

beforeEach(() => {
  serveProfile(server);
  serveCatalog(server);
});

const renderPage = (product: Product) =>
  renderWithProviders(
    <>
      <ProductView productId={product.id} />
      <Toaster />
    </>,
  );

type View = ReturnType<typeof renderPage>;

function defined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected an element');
  return value;
}

async function openCreate(view: View) {
  // The first render of a file is slow (module transforms): wait longer than the default second.
  const add = await screen.findByRole('button', { name: 'Add variant' }, { timeout: 5000 });
  await vi.waitFor(() => {
    expect(add).toHaveProperty('disabled', false);
  });
  await view.user.click(add);
  return screen.getByRole('dialog', { name: 'Add variant' });
}

async function choose(view: View, dialog: HTMLElement, attribute: string, value: string) {
  await view.user.click(within(dialog).getByRole('combobox', { name: new RegExp(`^${attribute}`) }));
  await view.user.click(await screen.findByRole('option', { name: value }));
}

async function fillPrices(view: View, dialog: HTMLElement, sku = 'SH-M-RED', price = '150', compareAt = '') {
  await view.user.type(within(dialog).getByRole('textbox', { name: /^SKU/ }), sku);
  await view.user.type(within(dialog).getByRole('textbox', { name: /^Price/ }), price);
  if (compareAt !== '') {
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Compare-at price/ }), compareAt);
  }
}

describe('variant form, create (spec 02 SE-11)', { timeout: 20_000 }, () => {
  it('one select per attribute in API order; the body sends option ids in that order', async () => {
    serveProduct(SHIRT);
    const bodies = serveCreate();
    const view = renderPage(SHIRT);
    const dialog = await openCreate(view);
    const selects = within(dialog).getAllByRole('combobox');
    expect(selects.map((select) => select.getAttribute('aria-labelledby') === null)).toBeDefined();
    expect(within(dialog).getByText('Size')).toBeDefined();
    expect(within(dialog).getByText('Color')).toBeDefined();
    await choose(view, dialog, 'Color', 'Red');
    await choose(view, dialog, 'Size', 'M');
    await fillPrices(view, dialog, ' SH-M-RED ', '150', '199.99');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Variant added.')).toBeDefined();
    expect(bodies).toEqual([
      {
        sku: 'SH-M-RED',
        price: '150',
        compareAtPrice: '199.99',
        optionIds: [SIZE.options[1]?.id, COLOR.options[0]?.id],
        initialStock: 0,
        status: 'active',
      },
    ]);
    expect(screen.queryByRole('dialog', { name: 'Add variant' })).toBeNull();
  });

  it('an incomplete option set is never sent', async () => {
    serveProduct(SHIRT);
    const bodies = serveCreate();
    const view = renderPage(SHIRT);
    const dialog = await openCreate(view);
    await choose(view, dialog, 'Size', 'M');
    await fillPrices(view, dialog);
    await view.user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Choose an option.')).toBeDefined();
    expect(bodies).toEqual([]);
  });

  it('an existing combination is disabled ("Already exists")', async () => {
    serveProduct(SHIRT);
    const view = renderPage(SHIRT);
    const dialog = await openCreate(view);
    await choose(view, dialog, 'Color', 'Red');
    await view.user.click(within(dialog).getByRole('combobox', { name: /^Size/ }));
    const taken = await screen.findByRole('option', { name: 'S (Already exists)' });
    expect(taken.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('option', { name: 'M' }).getAttribute('aria-disabled')).not.toBe('true');
  });

  it('compare-at must be greater than the price', async () => {
    serveProduct(SHIRT);
    const bodies = serveCreate();
    const view = renderPage(SHIRT);
    const dialog = await openCreate(view);
    await choose(view, dialog, 'Size', 'M');
    await choose(view, dialog, 'Color', 'Blue');
    await fillPrices(view, dialog, 'SH-M-BLUE', '150', '150.00');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('The compare-at price must be greater than the price.'),
    ).toBeDefined();
    expect(bodies).toEqual([]);
  });

  it('"Save and add another" keeps the dialog open with an empty form', async () => {
    serveProduct(SHIRT);
    const bodies = serveCreate();
    const view = renderPage(SHIRT);
    const dialog = await openCreate(view);
    await choose(view, dialog, 'Size', 'M');
    await choose(view, dialog, 'Color', 'Blue');
    await fillPrices(view, dialog, 'SH-M-BLUE');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save and add another' }));
    await vi.waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    const still = screen.getByRole('dialog', { name: 'Add variant' });
    await vi.waitFor(() => {
      expect(within(still).getByRole('textbox', { name: /^SKU/ })).toHaveProperty('value', '');
    });
  });

  it('a category without options: no selects, `optionIds: []`; then no more "Add variant"', async () => {
    const single = sellerProductFactory({ categoryId: OTHER_CATEGORY_ID });
    serveProduct(single);
    const bodies = serveCreate();
    const view = renderPage(single);
    const dialog = await openCreate(view);
    expect(within(dialog).queryAllByRole('combobox')).toHaveLength(1); // status only
    await fillPrices(view, dialog, 'ONE');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(bodies[0]?.optionIds).toEqual([]);
    });
  });

  it.each([
    ['SKU_TAKEN', 409, 'You already use this SKU.'],
    ['COMPARE_AT_PRICE_INVALID', 422, 'The compare-at price must be greater than the price.'],
    ['VARIANT_COMBINATION_EXISTS', 409, 'A variant with these options already exists.'],
    ['DEFAULT_VARIANT_EXISTS', 409, 'This product already has its single variant.'],
    ['VARIANT_LIMIT_REACHED', 422, 'A product can have at most 100 variants.'],
  ] as const)('%s is explained in the form', async (code, status, message) => {
    serveProduct(SHIRT);
    serveCreate({ status, code });
    const view = renderPage(SHIRT);
    const dialog = await openCreate(view);
    await choose(view, dialog, 'Size', 'M');
    await choose(view, dialog, 'Color', 'Blue');
    await fillPrices(view, dialog, 'SH-M-BLUE', '150', '200');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(message)).toBeDefined();
  });

  it('VARIANT_OPTIONS_INVALID: details land on their selects, the attributes are reloaded', async () => {
    serveProduct(SHIRT);
    serveCreate({
      status: 422,
      code: 'VARIANT_OPTIONS_INVALID',
      details: [{ value: COLOR.options[1]?.id ?? '' }],
    });
    let attributeCalls = 0;
    server.use(
      mockApi(
        'get',
        '/categories/{categoryId}/attributes',
        ({ reply }) => {
          attributeCalls += 1;
          return reply.ok([SIZE, COLOR]);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderPage(SHIRT);
    const dialog = await openCreate(view);
    await choose(view, dialog, 'Size', 'M');
    await choose(view, dialog, 'Color', 'Blue');
    await fillPrices(view, dialog, 'SH-M-BLUE');
    const before = attributeCalls;
    await view.user.click(within(dialog).getByRole('button', { name: 'Save' }));
    const messages = await within(dialog).findAllByText(
      'The options for this category changed. Please choose again.',
    );
    // The form alert and the Color select's error.
    expect(messages).toHaveLength(2);
    expect(
      within(dialog)
        .getByRole('combobox', { name: /^Color/ })
        .getAttribute('aria-invalid'),
    ).toBe('true');
    expect(within(dialog).getByRole('combobox', { name: /^Size/ }).getAttribute('aria-invalid')).toBe(
      'false',
    );
    await vi.waitFor(() => {
      expect(attributeCalls).toBeGreaterThan(before);
    });
  });
});

describe('variant form, edit and delete (spec 02 SE-11)', { timeout: 20_000 }, () => {
  async function openEdit(view: View, sku: string) {
    const [edit] = await screen.findAllByRole('button', { name: `Edit variant ${sku}` });
    if (edit === undefined) throw new Error('no edit button');
    await vi.waitFor(() => {
      expect(edit).toHaveProperty('disabled', false);
    });
    await view.user.click(edit);
    return screen.getByRole('dialog', { name: `Edit variant ${sku}` });
  }

  it('options read-only; only changed fields; a cleared compare-at is null', async () => {
    const product = { ...SHIRT, variants: [{ ...S_RED, compareAtPrice: '200.00' }] };
    const state = serveProduct(product);
    const bodies = serveUpdate();
    const view = renderPage(product);
    const dialog = await openEdit(view, 'SH-S-RED');
    expect(within(dialog).getByText('Size: S · Color: Red')).toBeDefined();
    expect(
      within(dialog).getByText("Options can't be changed. Delete this variant and create a new one instead."),
    ).toBeDefined();
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save).toHaveProperty('disabled', true);
    await view.user.clear(within(dialog).getByRole('textbox', { name: /^Compare-at price/ }));
    await view.user.click(save);
    expect(await screen.findByText('Variant saved.')).toBeDefined();
    expect(bodies).toEqual([{ compareAtPrice: null }]);
    await vi.waitFor(() => {
      expect(state.calls).toBe(2);
    });
  });

  it('the last active variant of a published product: the consequence is confirmed first', async () => {
    const product: Product = { ...SHIRT, status: 'active', visible: true };
    serveProduct(product);
    const bodies = serveUpdate();
    const view = renderPage(product);
    const dialog = await openEdit(view, 'SH-S-RED');
    await view.user.click(within(dialog).getByRole('combobox', { name: /^Status/ }));
    await view.user.click(await screen.findByRole('option', { name: 'Inactive' }));
    await view.user.click(within(dialog).getByRole('button', { name: 'Save' }));
    // The confirmation opens over the edit dialog, with the same title.
    const confirm = defined((await screen.findAllByRole('dialog', { name: 'Edit variant SH-S-RED' })).at(-1));
    expect(confirm.textContent).toContain(
      'This is the last active variant, so the product will be hidden from the store.',
    );
    expect(bodies).toEqual([]);
    await view.user.click(within(confirm).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(bodies).toEqual([{ status: 'inactive' }]);
    });
  });

  it('SKU_TAKEN on the field', async () => {
    serveProduct(SHIRT);
    serveUpdate({ status: 409, code: 'SKU_TAKEN' });
    const view = renderPage(SHIRT);
    const dialog = await openEdit(view, 'SH-S-RED');
    await view.user.type(within(dialog).getByRole('textbox', { name: /^SKU/ }), '-2');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('You already use this SKU.')).toBeDefined();
  });

  it('VARIANT_NOT_FOUND: closes, explains, refetches', async () => {
    const state = serveProduct(SHIRT);
    serveUpdate({ status: 404, code: 'VARIANT_NOT_FOUND' });
    const view = renderPage(SHIRT);
    const dialog = await openEdit(view, 'SH-S-RED');
    const price = within(dialog).getByRole('textbox', { name: /^Price/ });
    await view.user.clear(price);
    await view.user.type(price, '160');
    await view.user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('This variant no longer exists.')).toBeDefined();
    expect(screen.queryByRole('dialog', { name: 'Edit variant SH-S-RED' })).toBeNull();
    await vi.waitFor(() => {
      expect(state.calls).toBe(2);
    });
  });

  it('delete asks first and warns when it hides the product', async () => {
    const product: Product = { ...SHIRT, status: 'active', visible: true };
    const state = serveProduct(product);
    let deleted = 0;
    server.use(
      mockApi(
        'delete',
        '/seller/products/{productId}/variants/{variantId}',
        ({ reply }) => {
          deleted += 1;
          return reply.noContent();
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderPage(product);
    const remove = defined((await screen.findAllByRole('button', { name: 'Delete variant SH-S-RED' }))[0]);
    await vi.waitFor(() => {
      expect(remove).toHaveProperty('disabled', false);
    });
    await view.user.click(remove);
    const dialog = screen.getByRole('dialog', { name: 'Delete variant' });
    expect(dialog.textContent).toContain(
      'Delete variant SH-S-RED? This is the last active variant, so the product will be hidden from the store.',
    );
    expect(deleted).toBe(0);
    await view.user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Variant deleted.')).toBeDefined();
    expect(deleted).toBe(1);
    await vi.waitFor(() => {
      expect(state.calls).toBe(2);
    });
  });
});
