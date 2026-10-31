// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import { cairoDayBounds } from '@nile/domain';
import { fixtureId, mockApi, sellerProfileFactory, sellerReviewFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { parseReviewFilters, reviewApiQuery, reviewFiltersQuery } from '../lib/params';
import { ReviewsList } from './reviews-list';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

type Review = Schema<'SellerReviewDto'>;

const PAGE = { nextCursor: null, hasMore: false, limit: 20 };
const REVIEW = sellerReviewFactory();
const PRODUCT_ID = fixtureId(19700);

function serveProfile(status: Schema<'SellerProfileDto'>['status'] = 'approved') {
  server.use(
    mockApi('get', '/seller/profile', ({ reply }) => reply.ok(sellerProfileFactory({ status })), {
      base: BFF_BASE,
    }),
  );
}

function serveReviews(rows: Review[]) {
  const state = { rows, queries: [] as URLSearchParams[] };
  server.use(
    mockApi(
      'get',
      '/seller/reviews',
      ({ request, reply }) => {
        state.queries.push(new URL(request.url).searchParams);
        return reply.ok(state.rows, PAGE);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

function serveProducts() {
  server.use(
    mockApi(
      'get',
      '/seller/products',
      ({ reply }) =>
        reply.ok(
          [
            { id: PRODUCT_ID, name: 'Wool scarf' },
            { id: fixtureId(19701), name: 'Linen shirt' },
          ].map((product) => ({
            ...product,
            slug: 's',
            description: 'd',
            categoryId: fixtureId(3000),
            status: 'active' as const,
            visible: true,
            adminBlocked: false,
            adminBlockReason: null,
            minPrice: '1.00',
            maxPrice: '1.00',
            inStock: true,
            primaryImage: null,
            publishedAt: null,
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
          })),
          { nextCursor: null, hasMore: false, limit: 100 },
        ),
      { base: BFF_BASE },
    ),
  );
}

function serveReply(answer: () => Response) {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${BFF_BASE}/seller/reviews/${REVIEW.id}/reply`, async ({ request }) => {
      bodies.push(await request.json());
      return answer();
    }),
  );
  return bodies;
}

const fail = (status: number, code: ErrorCode) =>
  HttpResponse.json({ success: false, error: { code, message: code }, correlationId: 'corr-1' }, { status });

const renderPage = (params: Record<string, string> = {}) =>
  renderWithProviders(
    <>
      <ReviewsList params={params} />
      <Toaster />
    </>,
  );

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  serveProfile();
  serveProducts();
});

describe('review filters, URL ⇄ API (spec 02 SE-20)', () => {
  it('parses valid values and drops the rest', () => {
    expect(
      parseReviewFilters({ product: PRODUCT_ID, rating: '5,2,9,x,2', replied: 'false', from: '2026-10-01' }),
    ).toEqual({ productId: PRODUCT_ID, ratings: [2, 5], notReplied: true, from: '2026-10-01' });
    expect(parseReviewFilters({ product: 'nope', replied: 'true', from: '2026-02-31' })).toEqual({
      productId: null,
      ratings: [],
      notReplied: false,
      from: null,
    });
  });

  it('round-trips the URL and gives the literal API keys (from = start of the Cairo day)', () => {
    const filters = parseReviewFilters({ rating: '4,5', replied: 'false', from: '2026-10-01' });
    expect(reviewFiltersQuery(filters)).toBe('rating=4%2C5&replied=false&from=2026-10-01');
    expect(reviewApiQuery(filters)).toEqual({
      'rating[in]': '4,5',
      'replied[eq]': false,
      'createdAt[gte]': cairoDayBounds('2026-10-01').start,
    });
  });
});

describe('reviews list (spec 02 SE-20)', { timeout: 15_000 }, () => {
  it('a review: product link, stars, text, reviewer, options, date; newest first', async () => {
    const state = serveReviews([REVIEW]);
    renderPage();
    const list = await screen.findByRole('list', { name: 'Reviews of your products' });
    expect(within(list).getByRole('link', { name: REVIEW.product.name }).getAttribute('href')).toBe(
      `/products/${REVIEW.productId}`,
    );
    expect(within(list).getByText('Rated 4 out of 5')).toBeDefined();
    expect(within(list).getByText('Good shirt')).toBeDefined();
    expect(within(list).getByText('Soft fabric.')).toBeDefined();
    expect(within(list).getByText('Mona A.')).toBeDefined();
    expect(within(list).getByText('Size: M')).toBeDefined();
    expect(state.queries[0]?.get('sort')).toBe('-createdAt');
    expect(state.queries[0]?.get('limit')).toBe('20');
  });

  it('the URL filters reach the API; a rating chip navigates', async () => {
    const state = serveReviews([]);
    const view = renderPage({ product: PRODUCT_ID, replied: 'false' });
    expect(await screen.findByText('No reviews match these filters.')).toBeDefined();
    expect(state.queries[0]?.get('productId[eq]')).toBe(PRODUCT_ID);
    expect(state.queries[0]?.get('replied[eq]')).toBe('false');
    expect(screen.getByRole('button', { name: 'Not replied' }).getAttribute('aria-pressed')).toBe('true');
    await view.user.click(screen.getByRole('button', { name: '1 star' }));
    expect(router.push).toHaveBeenCalledWith(`/reviews?product=${PRODUCT_ID}&rating=1&replied=false`);
  });

  it('no reviews at all: "No reviews yet."', async () => {
    serveReviews([]);
    renderPage();
    expect(await screen.findByText('No reviews yet.')).toBeDefined();
  });

  it('a reply already given is shown, with no Reply button', async () => {
    serveReviews([
      { ...REVIEW, canReply: false, reply: { body: 'Thank you!', createdAt: '2026-10-26T10:00:00.000Z' } },
    ]);
    renderPage();
    expect(await screen.findByText('Thank you!')).toBeDefined();
    expect(screen.getByText('Your reply')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Reply to Mona A.' })).toBeNull();
  });

  it('Reply: once, trimmed; the answer replaces the review', async () => {
    serveReviews([REVIEW]);
    const bodies = serveReply(() =>
      HttpResponse.json(
        {
          success: true,
          data: {
            ...REVIEW,
            canReply: false,
            reply: { body: 'Thanks!', createdAt: '2026-10-26T10:00:00.000Z' },
          },
        },
        { status: 201 },
      ),
    );
    const view = renderPage();
    const reply = await screen.findByRole('button', { name: 'Reply to Mona A.' });
    await waitFor(() => {
      expect(reply.hasAttribute('disabled')).toBe(false);
    });
    await view.user.click(reply);
    expect(screen.getByText("You can reply once and can't edit it later.")).toBeDefined();
    await view.user.type(screen.getByRole('textbox', { name: /Your reply/ }), '  Thanks!  ');
    await view.user.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByText('Reply sent.')).toBeDefined();
    expect(bodies).toEqual([{ body: 'Thanks!' }]);
    expect(await screen.findByText('Thanks!')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Reply to Mona A.' })).toBeNull();
  });

  it('an empty reply is refused before sending', async () => {
    serveReviews([REVIEW]);
    const bodies = serveReply(() => fail(500, 'INTERNAL_ERROR'));
    const view = renderPage();
    const reply = await screen.findByRole('button', { name: 'Reply to Mona A.' });
    await waitFor(() => {
      expect(reply.hasAttribute('disabled')).toBe(false);
    });
    await view.user.click(reply);
    await view.user.type(screen.getByRole('textbox', { name: /Your reply/ }), '   ');
    await view.user.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByText('This field is required.')).toBeDefined();
    expect(bodies).toHaveLength(0);
  });

  it.each(['REVIEW_ALREADY_REPLIED', 'REVIEW_HIDDEN'] as const)(
    '%s: reads the list again and explains',
    async (code) => {
      const state = serveReviews([REVIEW]);
      serveReply(() => fail(409, code));
      const view = renderPage();
      const reply = await screen.findByRole('button', { name: 'Reply to Mona A.' });
      await waitFor(() => {
        expect(reply.hasAttribute('disabled')).toBe(false);
      });
      await view.user.click(reply);
      await view.user.type(screen.getByRole('textbox', { name: /Your reply/ }), 'Thanks');
      const before = screen.queryAllByText("This review can't be replied to any more.").length;
      await view.user.click(screen.getByRole('button', { name: 'Send reply' }));
      // Toasts of an earlier case may still be on screen: one more than before.
      await waitFor(() => {
        expect(screen.queryAllByText("This review can't be replied to any more.").length).toBeGreaterThan(
          before,
        );
      });
      await waitFor(() => {
        expect(state.queries.length).toBeGreaterThanOrEqual(2);
      });
    },
  );

  it('a seller not approved sees Reply disabled with the reason', async () => {
    serveProfile('pending_approval');
    serveReviews([REVIEW]);
    renderPage();
    const reply = await screen.findByRole('button', { name: 'Reply to Mona A.' });
    await waitFor(() => {
      expect(reply.hasAttribute('disabled')).toBe(true);
    });
    expect(reply.getAttribute('aria-describedby')).not.toBeNull();
  });
});
