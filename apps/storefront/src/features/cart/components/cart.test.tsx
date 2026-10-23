// @vitest-environment jsdom
import type { ErrorCode } from '@nile/api';
import { mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { act, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import type { Cart, CartLine } from '../api';
import { AddToCart } from './add-to-cart';
import { CartLink } from './cart-link';
import { CartView } from './cart-view';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
vi.mock('@/lib/use-has-session', () => ({ useHasSession: () => true }));

const server = setupMswServer();

beforeEach(() => {
  refresh.mockReset();
});

let sequence = 0;
const uuid = () => {
  sequence += 1;
  return `01900000-0000-7000-8000-${String(sequence).padStart(12, '0')}`;
};

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: uuid(),
    variantId: uuid(),
    productId: uuid(),
    productName: 'Linen shirt',
    productSlug: 'linen-shirt',
    sku: 'LIN-M',
    attributes: [
      { attribute: 'Size', value: 'M' },
      { attribute: 'Color', value: 'Red' },
    ],
    unitPrice: '250.00',
    quantity: 2,
    lineTotal: '500.00',
    issue: null,
    image: null,
    availableQuantity: 10,
    ...overrides,
  };
}

function cart(lines: CartLine[], overrides: Partial<Cart> = {}): Cart {
  return {
    id: uuid(),
    sellers:
      lines.length === 0
        ? []
        : [
            {
              sellerId: '01900000-0000-7000-8000-0000000000aa',
              businessName: 'Nile Crafts',
              items: lines,
              subtotal: '500.00',
            },
          ],
    itemsTotal: '500.00',
    itemCount: 2,
    hasIssues: lines.some((l) => l.issue !== null),
    ...overrides,
  };
}

function serveCart(...answers: Cart[]) {
  let calls = 0;
  server.use(
    mockApi(
      'get',
      '/cart',
      ({ reply }) => {
        const answer = answers[Math.min(calls, answers.length - 1)];
        calls += 1;
        if (answer === undefined) throw new Error('no cart answer');
        return reply.ok(answer);
      },
      { base: BFF_BASE },
    ),
  );
  return () => calls;
}

describe('cart page (spec 01 SF-06)', { timeout: 15_000 }, () => {
  it('groups lines by seller and shows the API totals as they are', async () => {
    serveCart(cart([line()], { itemsTotal: '500.00', itemCount: 2 }));
    renderWithProviders(<CartView />);
    const group = await screen.findByRole('region', { name: 'Sold by Nile Crafts' });
    expect(within(group).getByRole('link', { name: 'Linen shirt' }).getAttribute('href')).toBe(
      '/p/linen-shirt',
    );
    expect(within(group).getByText('Size: M · Color: Red')).toBeDefined();
    expect(within(group).getByText('SKU: LIN-M')).toBeDefined();
    expect(screen.getByText('Items (2)')).toBeDefined();
    expect(screen.getByText('Calculated at checkout')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Proceed to checkout' }).getAttribute('href')).toBe('/checkout');
  });

  it('empty: says so and links to the shop', async () => {
    serveCart(cart([], { itemsTotal: '0.00', itemCount: 0, id: null as unknown as string }));
    renderWithProviders(<CartView />);
    expect(await screen.findByText('Your cart is empty.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Start shopping' }).getAttribute('href')).toBe('/');
  });

  it.each([
    ['UNAVAILABLE', 'This item is no longer available.', 0, true],
    ['OUT_OF_STOCK', 'Out of stock.', 0, true],
    ['INSUFFICIENT_STOCK', 'Only 1 available.', 1, false],
  ] as const)(
    'issue %s: "%s", checkout blocked, quantity frozen=%s',
    async (issue, notice, available, frozen) => {
      serveCart(cart([line({ issue, availableQuantity: available })]));
      renderWithProviders(<CartView />);
      expect(await screen.findByText(notice)).toBeDefined();
      expect(screen.getByText("Items with a problem aren't included in the total.")).toBeDefined();
      expect(screen.getByRole('button', { name: 'Proceed to checkout' }).hasAttribute('disabled')).toBe(true);
      expect(screen.getByText('Fix the items marked above to continue.')).toBeDefined();
      expect(
        screen.getByRole('button', { name: 'Decrease quantity, Linen shirt' }).hasAttribute('disabled'),
      ).toBe(frozen);
    },
  );

  it('"Set to {available}" sends the available quantity and shows the returned cart', async () => {
    const fixed = line({ quantity: 1, lineTotal: '250.00' });
    serveCart(cart([line({ id: fixed.id, issue: 'INSUFFICIENT_STOCK', availableQuantity: 1 })]));
    let body: unknown;
    server.use(
      mockApi(
        'patch',
        '/cart/items/{itemId}',
        async ({ request, reply }) => {
          body = await request.json();
          return reply.ok(cart([fixed], { itemsTotal: '250.00', itemCount: 1 }));
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderWithProviders(<CartView />);
    await view.user.click(await screen.findByRole('button', { name: 'Set to 1' }));
    expect(await screen.findByText('Items (1)')).toBeDefined();
    expect(body).toEqual({ quantity: 1 });
  });

  it('quantity changes are saved once, 500 ms after the last click', async () => {
    const original = line();
    serveCart(cart([original]));
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'patch',
        '/cart/items/{itemId}',
        async ({ request, reply }) => {
          bodies.push(await request.json());
          return reply.ok(
            cart([line({ id: original.id, quantity: 4, lineTotal: '1000.00' })], { itemCount: 4 }),
          );
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderWithProviders(<CartView />);
    const increase = await screen.findByRole('button', { name: 'Increase quantity, Linen shirt' });
    await view.user.click(increase);
    await view.user.click(increase);
    expect(bodies).toEqual([]);
    await vi.waitFor(() => {
      expect(bodies).toEqual([{ quantity: 4 }]);
    });
    expect(await screen.findByText('Items (4)')).toBeDefined();
  });

  it.each<ErrorCode>(['CART_ITEM_NOT_FOUND', 'INSUFFICIENT_STOCK', 'VARIANT_NOT_PURCHASABLE'])(
    'a change failing with %s refetches the cart, which then shows the problem',
    async (code) => {
      const original = line();
      const calls = serveCart(
        cart([original]),
        cart([line({ id: original.id, issue: 'OUT_OF_STOCK', availableQuantity: 0 })]),
      );
      server.use(
        mockApi('patch', '/cart/items/{itemId}', ({ reply }) => reply.error(409, code), { base: BFF_BASE }),
      );
      const view = renderWithProviders(<CartView />);
      await view.user.click(await screen.findByRole('button', { name: 'Increase quantity, Linen shirt' }));
      expect(await screen.findByText('Out of stock.')).toBeDefined();
      expect(calls()).toBe(2);
    },
  );

  it('remove: deletes the line, then shows the refetched cart', async () => {
    const original = line();
    serveCart(cart([original]), cart([], { itemCount: 0, itemsTotal: '0.00' }));
    let removed = '';
    server.use(
      http.delete(`${BFF_BASE}/cart/items/:itemId`, ({ params }) => {
        removed = String(params.itemId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const view = renderWithProviders(<CartView />);
    await view.user.click(await screen.findByRole('button', { name: 'Remove Linen shirt' }));
    expect(await screen.findByText('Your cart is empty.')).toBeDefined();
    expect(removed).toBe(original.id);
  });

  it('empty cart: asks first, then clears it', async () => {
    serveCart(cart([line()]), cart([], { itemCount: 0, itemsTotal: '0.00' }));
    let emptied = false;
    server.use(
      http.delete(`${BFF_BASE}/cart`, () => {
        emptied = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const view = renderWithProviders(<CartView />);
    await view.user.click(await screen.findByRole('button', { name: 'Empty cart' }));
    const dialog = screen.getByRole('dialog', { name: 'Empty cart' });
    expect(dialog.textContent).toContain('Remove all items from your cart?');
    await view.user.click(within(dialog).getByRole('button', { name: 'Remove all' }));
    expect(await screen.findByText('Your cart is empty.')).toBeDefined();
    expect(emptied).toBe(true);
  });

  it('a failed load offers "Try again"', async () => {
    let calls = 0;
    server.use(
      mockApi(
        'get',
        '/cart',
        ({ reply }) => {
          calls += 1;
          return calls === 1 ? reply.error(500, 'INTERNAL_ERROR') : reply.ok(cart([line()]));
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderWithProviders(<CartView />);
    await view.user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Sold by Nile Crafts' })).toBeDefined();
  });
});

describe('header cart button (spec 01 §2.2)', () => {
  it('shows itemCount, hidden at 0', async () => {
    serveCart(cart([line()], { itemCount: 3 }));
    renderWithProviders(<CartLink />);
    expect(await screen.findByRole('link', { name: 'Cart, 3 items' })).toBeDefined();
  });

  it('no badge for an empty cart', async () => {
    serveCart(cart([], { itemCount: 0 }));
    renderWithProviders(<CartLink />);
    await vi.waitFor(() => {
      expect(screen.getByRole('link').getAttribute('aria-label')).toBe('Cart');
    });
    await act(() => Promise.resolve());
    expect(screen.queryByText('0')).toBeNull();
  });
});

describe('add to cart (spec 01 SF-05-A1)', { timeout: 15_000 }, () => {
  const VARIANT = '01900000-0000-7000-8000-00000000abcd';

  function failAdd(
    status: number,
    code: ErrorCode,
    details?: { field: string; constraint: string; message: string }[],
  ) {
    server.use(
      mockApi(
        'post',
        '/cart/items',
        ({ reply }) => reply.error(status, code, details === undefined ? {} : { details }),
        {
          base: BFF_BASE,
        },
      ),
    );
  }

  it.each([
    [422, 'VARIANT_NOT_PURCHASABLE', "This option isn't available any more.", true],
    [409, 'INSUFFICIENT_STOCK', 'Only 3 left. Please lower the quantity.', true],
    [422, 'CART_ITEM_QUANTITY_LIMIT', 'You can have at most 99 of this item in your cart.', false],
    [
      422,
      'CART_LINE_LIMIT_REACHED',
      'Your cart is full (50 different items). Remove something to add this.',
      false,
    ],
  ] as const)('%i %s → "%s" (product reloaded: %s)', async (status, code, message, reloads) => {
    failAdd(
      status,
      code,
      code === 'INSUFFICIENT_STOCK'
        ? [{ field: 'variantId', constraint: 'available', message: 'available: 3' }]
        : undefined,
    );
    const view = renderWithProviders(<AddToCart variantId={VARIANT} quantity={5} label="Add to cart" />);
    await view.user.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(refresh).toHaveBeenCalledTimes(reloads ? 1 : 0);
  });

  it('an ambiguous failure is not retried: the cart is refetched and the shopper told to check it', async () => {
    let adds = 0;
    server.use(
      mockApi(
        'post',
        '/cart/items',
        ({ reply }) => {
          adds += 1;
          return reply.error(503, 'SERVICE_UNAVAILABLE');
        },
        { base: BFF_BASE },
      ),
    );
    const cartCalls = serveCart(cart([line()]));
    const view = renderWithProviders(
      <>
        <CartLink />
        <AddToCart variantId={VARIANT} quantity={1} label="Add to cart" />
      </>,
    );
    await vi.waitFor(() => {
      expect(cartCalls()).toBe(1);
    });
    await view.user.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      "We couldn't confirm this was added. Check your cart.",
    );
    await vi.waitFor(() => {
      expect(cartCalls()).toBe(2);
    });
    expect(adds).toBe(1);
  });
});

describe('cart notice (spec 01 SF-07 entry guard)', () => {
  it('shows "needs attention" when sent back from checkout', async () => {
    serveCart(cart([line({ issue: 'OUT_OF_STOCK', availableQuantity: 0 })]));
    renderWithProviders(<CartView notice="needs-attention" />);
    expect(await screen.findByText('Some items in your cart need attention.')).toBeDefined();
  });
});
