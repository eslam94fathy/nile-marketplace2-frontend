// @vitest-environment jsdom
import type { ErrorCode } from '@nile/api';
import { mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { PENDING_WISHLIST_KEY, type WishlistItem } from '../api';
import { WishlistHeart } from './wishlist-heart';
import { WishlistIntent } from './wishlist-intent';
import { WishlistView } from './wishlist-view';

const push = vi.fn();
const search = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => search.params,
}));
const session = vi.hoisted(() => ({ present: true }));
vi.mock('@/lib/use-has-session', () => ({ useHasSession: () => session.present }));

const server = setupMswServer();

const PRODUCT = '01900000-0000-7000-8000-0000000000f1';
const OTHER = '01900000-0000-7000-8000-0000000000f2';

beforeEach(() => {
  push.mockReset();
  session.present = true;
  search.params = new URLSearchParams();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/p/linen-shirt?variant=v1');
});

function serveIds(ids: string[]) {
  let calls = 0;
  server.use(
    mockApi(
      'get',
      '/me/wishlist/product-ids',
      ({ reply }) => {
        calls += 1;
        return reply.ok({ productIds: ids });
      },
      { base: BFF_BASE },
    ),
  );
  return () => calls;
}

/** PUT / DELETE answers: `204`, an error code, or a dropped connection. */
function serveChange(method: 'put' | 'delete', answer: 204 | ErrorCode | 'network') {
  const calls: string[] = [];
  server.use(
    http[method](`${BFF_BASE}/me/wishlist/:productId`, ({ params }) => {
      calls.push(String(params.productId));
      if (answer === 204) return new HttpResponse(null, { status: 204 });
      if (answer === 'network') return HttpResponse.error();
      const status = answer === 'PRODUCT_NOT_FOUND' ? 404 : 422;
      return HttpResponse.json(
        { success: false, error: { code: answer, message: answer }, correlationId: 'corr-1' },
        { status },
      );
    }),
  );
  return calls;
}

function renderHeart(productId = PRODUCT) {
  return renderWithProviders(
    <>
      <WishlistHeart productId={productId} />
      <Toaster />
    </>,
  );
}

describe('wishlist heart (spec 01 SF-23-A1)', { timeout: 15_000 }, () => {
  it('reflects the saved ids, read once for every heart', async () => {
    const idCalls = serveIds([PRODUCT]);
    renderWithProviders(
      <>
        <WishlistHeart productId={PRODUCT} />
        <WishlistHeart productId={OTHER} />
      </>,
    );
    expect(await screen.findByRole('button', { name: 'Remove from wishlist', pressed: true })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Save to wishlist', pressed: false })).toBeDefined();
    expect(idCalls()).toBe(1);
  });

  it('signed out: goes to sign-in, coming back to this page with the product to save', async () => {
    session.present = false;
    const idCalls = serveIds([]);
    const view = renderHeart();
    await view.user.click(screen.getByRole('button', { name: 'Save to wishlist' }));
    const target = new URL(String(push.mock.calls[0]?.[0]), 'http://x.test');
    expect(target.pathname).toBe('/login');
    expect(target.searchParams.get('returnTo')).toBe(`/p/linen-shirt?variant=v1&wishlist=${PRODUCT}`);
    // The tap is remembered in this tab: the URL alone never saves (security review T-K3).
    expect(window.sessionStorage.getItem(PENDING_WISHLIST_KEY)).toBe(PRODUCT);
    expect(idCalls()).toBe(0);
  });

  it('save: the heart fills at once and stays filled after the 204', async () => {
    serveIds([]);
    const puts = serveChange('put', 204);
    const view = renderHeart();
    await view.user.click(await screen.findByRole('button', { name: 'Save to wishlist' }));
    expect(screen.getByRole('button', { name: 'Remove from wishlist' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await waitFor(() => {
      expect(puts).toEqual([PRODUCT]);
    });
    expect(screen.getByRole('button', { name: 'Remove from wishlist', pressed: true })).toBeDefined();
  });

  it('remove: DELETE, the heart empties', async () => {
    serveIds([PRODUCT]);
    const deletes = serveChange('delete', 204);
    const view = renderHeart();
    await view.user.click(await screen.findByRole('button', { name: 'Remove from wishlist' }));
    await waitFor(() => {
      expect(deletes).toEqual([PRODUCT]);
    });
    expect(screen.getByRole('button', { name: 'Save to wishlist', pressed: false })).toBeDefined();
  });

  it.each([
    ['WISHLIST_LIMIT_REACHED', 'Your wishlist is full (200 items). Remove something to save this.'],
    ['PRODUCT_NOT_FOUND', "This product isn't available any more."],
  ] as const)('%s: the heart goes back and the toast says "%s"', async (code, message) => {
    serveIds([]);
    serveChange('put', code);
    const view = renderHeart();
    await view.user.click(await screen.findByRole('button', { name: 'Save to wishlist' }));
    expect(await screen.findByText(message)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Save to wishlist', pressed: false })).toBeDefined();
  });

  it('a lost connection is sent once more, then reverted', async () => {
    serveIds([]);
    const puts = serveChange('put', 'network');
    const view = renderHeart();
    await view.user.click(await screen.findByRole('button', { name: 'Save to wishlist' }));
    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: 'Save to wishlist', pressed: false })).toBeDefined();
      },
      { timeout: 4_000 },
    ); // TanStack waits about 1 s before the retry.
    expect(puts).toHaveLength(2);
  });
});

describe('save after sign-in (SF-Q-17)', { timeout: 15_000 }, () => {
  it('saves the product once, says so and drops the parameter', async () => {
    serveIds([]);
    const puts = serveChange('put', 204);
    window.sessionStorage.setItem(PENDING_WISHLIST_KEY, PRODUCT);
    search.params = new URLSearchParams({ variant: 'v1', wishlist: PRODUCT });
    window.history.replaceState(null, '', `/p/linen-shirt?variant=v1&wishlist=${PRODUCT}`);
    const view = renderWithProviders(
      <>
        <WishlistIntent />
        <Toaster />
      </>,
    );
    expect(await screen.findByText('Saved to your wishlist.')).toBeDefined();
    expect(puts).toEqual([PRODUCT]);
    expect(window.location.search).toBe('?variant=v1');
    expect(window.sessionStorage.getItem(PENDING_WISHLIST_KEY)).toBeNull();
    view.rerender(
      <>
        <WishlistIntent />
        <Toaster />
      </>,
    );
    expect(puts).toHaveLength(1);
  });

  it('a link carrying ?wishlist= saves nothing without a heart tap in this tab; the parameter is dropped', async () => {
    const puts = serveChange('put', 204);
    search.params = new URLSearchParams({ wishlist: PRODUCT });
    window.history.replaceState(null, '', `/?wishlist=${PRODUCT}`);
    renderWithProviders(<WishlistIntent />);
    await waitFor(() => {
      expect(window.location.search).toBe('');
    });
    window.sessionStorage.setItem(PENDING_WISHLIST_KEY, OTHER);
    search.params = new URLSearchParams({ wishlist: PRODUCT });
    renderWithProviders(<WishlistIntent />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(puts).toEqual([]);
  });

  it('does nothing while signed out or with an invalid id', async () => {
    const puts = serveChange('put', 204);
    session.present = false;
    search.params = new URLSearchParams({ wishlist: PRODUCT });
    renderWithProviders(<WishlistIntent />);
    session.present = true;
    search.params = new URLSearchParams({ wishlist: 'not-an-id' });
    renderWithProviders(<WishlistIntent />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(puts).toEqual([]);
  });
});

let sequence = 0;
function item(overrides: Partial<WishlistItem['product']> = {}): WishlistItem {
  sequence += 1;
  const id = `01900000-0000-7000-8000-${String(sequence).padStart(12, '0')}`;
  return {
    productId: id,
    addedAt: '2026-10-20T10:00:00.000Z',
    product: {
      id,
      slug: `product-${String(sequence)}`,
      name: `Product ${String(sequence)}`,
      minPrice: '100.00',
      maxPrice: '100.00',
      inStock: true,
      available: true,
      primaryImage: null,
      rating: { avg: null, count: 0 },
      ...overrides,
    },
  };
}

function serveList(...pages: { data: WishlistItem[]; nextCursor: string | null }[]) {
  let calls = 0;
  server.use(
    mockApi(
      'get',
      '/me/wishlist',
      ({ reply }) => {
        const page = pages[Math.min(calls, pages.length - 1)] ?? { data: [], nextCursor: null };
        calls += 1;
        return reply.ok(page.data, {
          nextCursor: page.nextCursor,
          hasMore: page.nextCursor !== null,
          limit: 20,
        });
      },
      { base: BFF_BASE },
    ),
  );
  return () => calls;
}

describe('wishlist page (spec 01 SF-23)', { timeout: 15_000 }, () => {
  it('cards link to the product; out of stock is marked; unavailable is greyed with only "Remove"', async () => {
    const gone = item({ name: 'Old lamp', available: false, minPrice: null, maxPrice: null });
    serveList({
      data: [
        item({ name: 'Linen shirt', slug: 'linen-shirt' }),
        item({ name: 'Wool scarf', inStock: false }),
        gone,
      ],
      nextCursor: null,
    });
    renderWithProviders(<WishlistView />);
    expect((await screen.findByRole('link', { name: 'Linen shirt' })).getAttribute('href')).toBe(
      '/p/linen-shirt',
    );
    const scarf = screen.getByRole('link', { name: 'Wool scarf' }).closest('article');
    expect(scarf === null ? null : within(scarf).getByText('Out of stock')).not.toBeNull();
    const lamp = screen.getByText('Old lamp').closest('article');
    if (lamp === null) throw new Error('no card');
    expect(within(lamp).getByText('No longer available')).toBeDefined();
    expect(within(lamp).queryByRole('link')).toBeNull();
    expect(within(lamp).getByRole('button', { name: 'Remove Old lamp from your wishlist' })).toBeDefined();
  });

  it('remove: DELETE, then the list is read again', async () => {
    const first = item({ name: 'Linen shirt' });
    const listCalls = serveList({ data: [first], nextCursor: null }, { data: [], nextCursor: null });
    serveIds([first.productId]);
    const deletes = serveChange('delete', 204);
    const view = renderWithProviders(<WishlistView />);
    await view.user.click(
      await screen.findByRole('button', { name: 'Remove Linen shirt from your wishlist' }),
    );
    expect(
      await screen.findByText('Your wishlist is empty. Tap the heart on a product to save it here.'),
    ).toBeDefined();
    expect(deletes).toEqual([first.productId]);
    expect(listCalls()).toBe(2);
  });

  it('load more by cursor', async () => {
    serveList(
      { data: [item({ name: 'First' })], nextCursor: 'c2' },
      { data: [item({ name: 'Second' })], nextCursor: null },
    );
    const view = renderWithProviders(<WishlistView />);
    await screen.findByRole('link', { name: 'First' });
    await view.user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('link', { name: 'Second' })).toBeDefined();
  });

  it('a failed load offers "Try again"', async () => {
    server.use(
      mockApi('get', '/me/wishlist', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), { base: BFF_BASE }),
    );
    renderWithProviders(<WishlistView />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Your wishlist couldn't be loaded.");
  });
});
