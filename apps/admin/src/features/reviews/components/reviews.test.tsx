// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import {
  adminCustomerDetailFactory,
  adminProductFactory,
  adminReviewFactory,
  adminSellerDetailFactory,
  mockApi,
  productImageFactory,
} from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { ReviewDetail } from './review-detail';
import { ReviewsList } from './reviews-list';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

type Review = Schema<'AdminReviewDto'>;

const SELLER = adminSellerDetailFactory({ businessName: 'Nile Crafts' });
const PRODUCT = adminProductFactory({ name: 'Linen shirt', sellerId: SELLER.id });
const CUSTOMER = adminCustomerDetailFactory({ firstName: 'Omar', lastName: 'Kamal' });
const REVIEW = adminReviewFactory({ productId: PRODUCT.id, sellerId: SELLER.id, customerId: CUSTOMER.id });
const REPLY = {
  body: 'Sorry, we will replace it.',
  createdAt: '2026-10-27T09:00:00.000Z',
  hiddenAt: null,
  hiddenReason: null,
};
const PAGE = { nextCursor: null, hasMore: false, limit: 20 };

beforeEach(() => {
  router.push.mockReset();
  server.use(
    mockApi('get', '/admin/sellers/{sellerId}', ({ reply }) => reply.ok(SELLER), { base: BFF_BASE }),
    mockApi('get', '/admin/products/{productId}', ({ reply }) => reply.ok(PRODUCT), { base: BFF_BASE }),
    mockApi('get', '/admin/customers/{customerId}', ({ reply }) => reply.ok(CUSTOMER), { base: BFF_BASE }),
  );
});

function serveList(rows: Review[]) {
  const queries: Record<string, string>[] = [];
  server.use(
    mockApi(
      'get',
      '/admin/reviews',
      ({ request, reply }) => {
        queries.push(Object.fromEntries(new URL(request.url).searchParams));
        return reply.ok(rows, PAGE);
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

function serveReview(initial: Review) {
  const state = { review: initial, reads: 0 };
  server.use(
    mockApi(
      'get',
      '/admin/reviews/{reviewId}',
      ({ reply }) => {
        state.reads += 1;
        return reply.ok(state.review);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

const renderDetail = (review: Review = REVIEW) =>
  renderWithProviders(
    <>
      <ReviewDetail reviewId={review.id} />
      <Toaster />
    </>,
  );

describe('reviews (spec 03 AD-30, T-M6)', { timeout: 15_000 }, () => {
  it('newest first without filters; rows name the product and seller, rating, status, hidden reply, photos', async () => {
    const withReply = adminReviewFactory({
      productId: PRODUCT.id,
      sellerId: SELLER.id,
      images: [productImageFactory(), productImageFactory()],
      reply: { ...REPLY, hiddenAt: '2026-10-28T09:00:00.000Z', hiddenReason: 'Rude' },
    });
    const queries = serveList([withReply]);
    renderWithProviders(<ReviewsList params={{}} />);
    const table = await screen.findByRole('table', { name: 'Reviews, newest first' });
    expect(
      (await within(table).findByRole('link', { name: withReply.title ?? '' })).getAttribute('href'),
    ).toBe(`/reviews/${withReply.id}`);
    expect((await within(table).findByRole('link', { name: 'Linen shirt' })).getAttribute('href')).toBe(
      `/products/${PRODUCT.id}`,
    );
    expect((await within(table).findByRole('link', { name: 'Nile Crafts' })).getAttribute('href')).toBe(
      `/sellers/${SELLER.id}`,
    );
    expect(within(table).getByText('Rated 2 out of 5')).toBeDefined();
    expect(within(table).getByText('Published')).toBeDefined();
    expect(within(table).getByText('Reply hidden')).toBeDefined();
    expect(within(table).getByRole('cell', { name: '2' })).toBeDefined();
    expect(queries[0]).toEqual({ limit: '20' });
  });

  it('URL filters are sent; scopes from other screens are named chips that remove themselves', async () => {
    const queries = serveList([]);
    renderWithProviders(
      <ReviewsList
        params={{
          status: 'hidden',
          rating: '3',
          product: PRODUCT.id,
          seller: SELLER.id,
          customer: CUSTOMER.id,
        }}
      />,
    );
    expect(await screen.findByText('No reviews match these filters.')).toBeDefined();
    expect(queries[0]).toEqual({
      limit: '20',
      'status[eq]': 'hidden',
      'rating[lte]': '3',
      'productId[eq]': PRODUCT.id,
      'sellerId[eq]': SELLER.id,
      'customerId[eq]': CUSTOMER.id,
    });
    const scopes = screen.getByRole('list', { name: 'Showing reviews of' });
    expect(await within(scopes).findByText('Product: Linen shirt')).toBeDefined();
    expect(await within(scopes).findByText('Seller: Nile Crafts')).toBeDefined();
    expect(await within(scopes).findByText('Customer: Omar Kamal')).toBeDefined();
    const remove = within(scopes).getByRole('link', { name: 'Remove Product: Linen shirt' });
    expect(remove.getAttribute('href')).toBe(
      `/reviews?status=hidden&rating=3&seller=${SELLER.id}&customer=${CUSTOMER.id}`,
    );
  });

  it('invalid URL values are dropped; choosing "3 stars or fewer" navigates', async () => {
    const queries = serveList([REVIEW]);
    const view = renderWithProviders(<ReviewsList params={{ status: 'gone', rating: '5', product: 'x' }} />);
    await screen.findByRole('table', { name: 'Reviews, newest first' });
    expect(queries[0]).toEqual({ limit: '20' });
    expect(screen.queryByRole('list', { name: 'Showing reviews of' })).toBeNull();
    await view.user.click(screen.getByRole('combobox', { name: 'Rating' }));
    await view.user.click(await screen.findByRole('option', { name: '3 stars or fewer' }));
    expect(router.push).toHaveBeenCalledWith('/reviews?rating=3');
  });

  it('a failed list offers a retry', async () => {
    server.use(
      mockApi('get', '/admin/reviews', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), { base: BFF_BASE }),
    );
    renderWithProviders(<ReviewsList params={{}} />);
    expect(await screen.findByText("The reviews couldn't be loaded.")).toBeDefined();
    expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
  });
});

describe('review (spec 03 AD-31, T-M6)', { timeout: 15_000 }, () => {
  it('the whole review with its links and the seller reply', async () => {
    serveReview({ ...REVIEW, reply: REPLY, images: [productImageFactory()] });
    renderDetail();
    expect(await screen.findByRole('heading', { level: 1, name: REVIEW.title ?? '' })).toBeDefined();
    expect(screen.getByText('The colour ran.')).toBeDefined();
    const details = screen.getByLabelText('Review details');
    expect((await within(details).findByRole('link', { name: 'Linen shirt' })).getAttribute('href')).toBe(
      `/products/${PRODUCT.id}`,
    );
    expect(
      within(details)
        .getByRole('link', { name: CUSTOMER.id.slice(0, 8) })
        .getAttribute('href'),
    ).toBe(`/customers/${CUSTOMER.id}`);
    expect(within(details).getByText('Size: L')).toBeDefined();
    expect(within(details).getByText('Omar K.')).toBeDefined();
    expect(screen.getByRole('list', { name: 'Photos from Omar K.' })).toBeDefined();
    expect(screen.getByText('Sorry, we will replace it.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Hide review' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Hide reply' })).toBeDefined();
  });

  it('hide review: the spec note, a required reason, the answer replaces the review', async () => {
    const state = serveReview(REVIEW);
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/reviews/{reviewId}/hide',
        async ({ request, reply }) => {
          bodies.push(await request.json());
          state.review = {
            ...REVIEW,
            status: 'hidden',
            hiddenReason: 'Off topic',
            hiddenAt: '2026-10-31T09:00:00.000Z',
          };
          return reply.ok(state.review);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail();
    await view.user.click(await screen.findByRole('button', { name: 'Hide review' }));
    const dialog = screen.getByRole('dialog', { name: 'Hide review' });
    expect(
      within(dialog).getByText(
        'The review stops counting toward the rating. The author sees it as hidden, without the reason.',
      ),
    ).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Hide review' }));
    expect(await within(dialog).findByText(/at least 3 characters/)).toBeDefined();
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), ' Off topic ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Hide review' }));
    expect(await screen.findByText('The review is hidden.')).toBeDefined();
    expect(bodies).toEqual([{ reason: 'Off topic' }]);
    expect(await screen.findByText('Off topic')).toBeDefined();
    expect(
      within(screen.getByRole('group', { name: 'Review actions' })).getByRole('button', {
        name: 'Show review',
      }),
    ).toBeDefined();
  });

  it('show reply; REVIEW_REPLY_NOT_FOUND reads the review again', async () => {
    const hiddenReply = {
      ...REVIEW,
      reply: { ...REPLY, hiddenAt: '2026-10-28T09:00:00.000Z', hiddenReason: 'Rude' },
    };
    const state = serveReview(hiddenReply);
    server.use(
      mockApi(
        'post',
        '/admin/reviews/{reviewId}/reply/unhide',
        ({ reply }) => {
          state.review = { ...REVIEW, reply: null };
          return reply.error(404, 'REVIEW_REPLY_NOT_FOUND');
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail(hiddenReply);
    expect(await screen.findByText('Rude')).toBeDefined();
    await view.user.click(screen.getByRole('button', { name: 'Show reply' }));
    const dialog = screen.getByRole('dialog', { name: 'Show reply' });
    const reads = state.reads;
    await view.user.click(within(dialog).getByRole('button', { name: 'Show reply' }));
    expect(
      await screen.findByText('This review changed meanwhile. Here is its current state.'),
    ).toBeDefined();
    await vi.waitFor(() => {
      expect(state.reads).toBeGreaterThan(reads);
    });
    expect(await screen.findByText('The seller hasn’t replied.')).toBeDefined();
  });

  it('an unknown review is "not found"', async () => {
    server.use(
      mockApi('get', '/admin/reviews/{reviewId}', ({ reply }) => reply.error(404, 'REVIEW_NOT_FOUND'), {
        base: BFF_BASE,
      }),
    );
    renderDetail();
    expect(await screen.findByText("This review doesn't exist.")).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to reviews' }).getAttribute('href')).toBe('/reviews');
  });
});
