// @vitest-environment jsdom
import { mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import type { ProductDetail, ProductVariant } from '../lib/variant-selection';
import { ProductView, type ProductViewProps } from './product-view';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const server = setupMswServer();

const session = vi.hoisted(() => ({ present: false }));
vi.mock('@/lib/use-has-session', () => ({ useHasSession: () => session.present }));

beforeEach(() => {
  push.mockReset();
  session.present = false;
  window.history.replaceState(null, '', '/p/tee');
});

let sequence = 0;
function variant(options: Record<string, string>, overrides: Partial<ProductVariant> = {}): ProductVariant {
  sequence += 1;
  return {
    id: `01900000-0000-7000-8000-${String(sequence).padStart(12, '0')}`,
    sku: `TEE-${Object.values(options).join('-').toUpperCase() || 'DEFAULT'}`,
    price: '100.00',
    compareAtPrice: null,
    options: Object.entries(options).map(([attributeCode, optionCode]) => ({
      attributeCode,
      optionCode,
      value: optionCode.toUpperCase(),
    })),
    inStock: true,
    availableQuantity: 5,
    imageId: null,
    ...overrides,
  };
}

const M_RED = variant({ size: 'm', color: 'red' }, { price: '120.00', compareAtPrice: '150.00' });
const M_BLUE = variant({ size: 'm', color: 'blue' }, { inStock: false, availableQuantity: 0 });
const L_RED = variant({ size: 'l', color: 'red' });

function product(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: '01900000-0000-7000-8000-0000000000ff',
    slug: 'tee',
    name: 'Tee',
    description: 'A tee.',
    category: { id: 'c', name: 'Tees', slug: 'tees', path: [] },
    seller: {
      id: '01900000-0000-7000-8000-0000000000aa',
      businessName: 'Nile Crafts',
      ratingAvg: null,
      ratingCount: 0,
    },
    minPrice: '100.00',
    maxPrice: '120.00',
    inStock: true,
    rating: { avg: null, count: 0 },
    images: [],
    attributes: [
      {
        code: 'size',
        name: 'Size',
        options: [
          { code: 'm', value: 'M' },
          { code: 'l', value: 'L' },
        ],
      },
      {
        code: 'color',
        name: 'Color',
        options: [
          { code: 'red', value: 'RED' },
          { code: 'blue', value: 'BLUE' },
        ],
      },
    ],
    variants: [M_RED, M_BLUE, L_RED],
    publishedAt: '2026-10-14T08:00:00.000Z',
    ...overrides,
  };
}

function renderView(props: Partial<ProductViewProps> = {}) {
  return renderWithProviders(
    <ProductView product={product()} variantId={null} quantity={null} heading={<h1>Tee</h1>} {...props} />,
  );
}

function image(id: string, position: number, altText: string | null = null): ProductDetail['images'][number] {
  return {
    id,
    position,
    variantId: null,
    altText,
    urls: {
      thumb: `https://media.test/${id}-t.webp`,
      medium: `https://media.test/${id}-m.webp`,
      large: `https://media.test/${id}-l.webp`,
    },
    width: 1200,
    height: 1200,
  };
}

const mainPhoto = () => screen.getByRole('button', { name: /View larger/ }).querySelector('img');

const addButton = () => screen.getByRole('button', { name: 'Add to cart' });

describe('product page (spec 01 SF-05)', { timeout: 15_000 }, () => {
  it('without a full selection: the price range, a hint, and no add', () => {
    renderView();
    expect(screen.getByText(/100\.00.*120\.00/)).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe('Choose your options to add this to your cart.');
    expect(addButton().hasAttribute('disabled')).toBe(true);
  });

  it("selecting options: the variant's price with the compare-at price struck, in stock, SKU, URL updated", async () => {
    const view = renderView();
    await view.user.click(screen.getByRole('radio', { name: 'M' }));
    await view.user.click(screen.getByRole('radio', { name: 'RED' }));
    expect(screen.getByText(/120\.00/)).toBeDefined();
    expect(screen.getByText(/Was .*150\.00/)).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe('In stock');
    expect(screen.getByText('TEE-M-RED')).toBeDefined();
    expect(window.location.search).toBe(`?variant=${M_RED.id}`);
    expect(addButton().hasAttribute('disabled')).toBe(false);
  });

  it('options that make no existing variant with the current choices are disabled', async () => {
    const view = renderView();
    await view.user.click(screen.getByRole('radio', { name: 'L' }));
    expect(
      screen.getByRole('radio', { name: /BLUE: Not available in this combination/ }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByRole('radio', { name: 'RED' }).hasAttribute('disabled')).toBe(false);
  });

  it('an out-of-stock option stays selectable, is marked, and can not be added', async () => {
    const view = renderView();
    await view.user.click(screen.getByRole('radio', { name: 'M' }));
    const blue = screen.getByRole('radio', { name: /BLUE.*Out of stock/ });
    await view.user.click(blue);
    expect(screen.getByRole('status').textContent).toBe('Out of stock');
    expect(screen.queryByLabelText('Quantity')).toBeNull();
    expect(addButton().hasAttribute('disabled')).toBe(true);
  });

  it('a product without attributes: its default variant is selected, no picker', () => {
    const only = variant({}, { sku: 'MUG-1' });
    renderView({
      product: product({ attributes: [], variants: [only], minPrice: '100.00', maxPrice: '100.00' }),
    });
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toBe('In stock');
    expect(screen.getByText('MUG-1')).toBeDefined();
  });

  it('?variant and ?qty preselect (back from sign-in); the stepper stays within 1..available', async () => {
    const view = renderView({ variantId: L_RED.id, quantity: '3' });
    expect(screen.getByRole('radio', { name: 'L' })).toHaveProperty('checked', true);
    const quantity = screen.getByLabelText<HTMLInputElement>('Quantity');
    expect(quantity.value).toBe('3');
    await view.user.click(screen.getByRole('button', { name: 'Increase quantity' }));
    await view.user.click(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(quantity.value).toBe('5');
    expect(screen.getByRole('button', { name: 'Increase quantity' }).hasAttribute('disabled')).toBe(true);
  });

  it('signed out: "Add to cart" goes to sign-in and comes back with the variant and quantity (FQ-6)', async () => {
    const view = renderView({ variantId: M_RED.id, quantity: '2' });
    await view.user.click(addButton());
    expect(push).toHaveBeenCalledWith(
      `/login?returnTo=${encodeURIComponent(`/p/tee?variant=${M_RED.id}&qty=2`)}`,
    );
  });

  it('signed in: adds the selected variant and quantity, then offers "View cart"', async () => {
    session.present = true;
    let body: unknown;
    server.use(
      mockApi(
        'post',
        '/cart/items',
        async ({ request, reply }) => {
          body = await request.json();
          return reply.created({ id: null, sellers: [], itemsTotal: '0.00', itemCount: 0, hasIssues: false });
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderView({ variantId: M_RED.id, quantity: '2' });
    await view.user.click(addButton());
    expect(await screen.findByText('Added to cart')).toBeDefined();
    expect(body).toEqual({ variantId: M_RED.id, quantity: 2 });
    expect(screen.getByRole('link', { name: 'View cart' }).getAttribute('href')).toBe('/cart');
    expect(push).not.toHaveBeenCalled();
  });

  it('links the seller to their products', () => {
    renderView();
    expect(screen.getByRole('link', { name: 'Nile Crafts' }).getAttribute('href')).toBe(
      '/search?seller=01900000-0000-7000-8000-0000000000aa',
    );
  });
});

describe('product page images and ratings (spec 01 §10.3, T-K1)', { timeout: 15_000 }, () => {
  const FRONT = image('01900000-0000-7000-8000-0000000000c1', 0, 'Tee, front');
  const BLUE = image('01900000-0000-7000-8000-0000000000c2', 1);

  it('shows the primary photo, then the image of a chosen variant that has one', async () => {
    const blue = { ...M_BLUE, imageId: BLUE.id };
    const view = renderView({ product: product({ images: [FRONT, BLUE], variants: [M_RED, blue, L_RED] }) });
    expect(mainPhoto()?.getAttribute('alt')).toBe('Tee, front');
    expect(mainPhoto()?.getAttribute('fetchpriority')).toBe('high');
    await view.user.click(screen.getByRole('radio', { name: 'M' }));
    await view.user.click(screen.getByRole('radio', { name: /BLUE/ }));
    // No alt text of its own: the product name (conventions §12.1).
    expect(mainPhoto()?.getAttribute('alt')).toBe('Tee');
    // A variant without an image keeps the photo on screen.
    await view.user.click(screen.getByRole('radio', { name: 'RED' }));
    expect(mainPhoto()?.getAttribute('alt')).toBe('Tee');
  });

  it("opens on the URL variant's image", () => {
    const red = { ...M_RED, imageId: BLUE.id };
    renderView({
      product: product({ images: [FRONT, BLUE], variants: [red, M_BLUE, L_RED] }),
      variantId: red.id,
    });
    expect(mainPhoto()?.getAttribute('alt')).toBe('Tee');
  });

  it('shows the placeholder without photos', () => {
    renderView();
    expect(screen.getByRole('img', { name: 'Tee' }).tagName.toLowerCase()).toBe('svg');
  });

  it('shows the product rating and the seller rating only when the seller has reviews', () => {
    const { unmount } = renderView({
      product: product({
        rating: { avg: '4.30', count: 12 },
        seller: { id: 's', businessName: 'Nile Crafts', ratingAvg: '4.80', ratingCount: 30 },
      }),
    });
    expect(
      screen.getByRole('link', { name: 'Rated 4.3 out of 5 from 12 reviews' }).getAttribute('href'),
    ).toBe('#reviews');
    expect(screen.getByText('Rated 4.8 out of 5 from 30 reviews')).toBeDefined();
    unmount();
    renderView();
    expect(screen.getAllByText('No reviews yet')).toHaveLength(1);
    // Nothing to jump to without reviews.
    expect(screen.queryByRole('link', { name: 'No reviews yet' })).toBeNull();
  });
});
