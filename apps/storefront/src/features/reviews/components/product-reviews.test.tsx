// @vitest-environment jsdom
import { mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import type { RatingSummary, Review } from '../api';
import { ProductReviews } from './product-reviews';

const server = setupMswServer();

const PRODUCT_ID = '01900000-0000-7000-8000-0000000000ff';

let sequence = 0;
function review(overrides: Partial<Review> = {}): Review {
  sequence += 1;
  return {
    id: `01900000-0000-7000-8000-${String(sequence).padStart(12, '0')}`,
    productId: PRODUCT_ID,
    rating: 4,
    title: 'Great fit',
    body: 'Soft fabric.\nRuns a little large.',
    images: [],
    reviewer: { displayName: 'Mona A.' },
    variantOptions: [{ attribute: 'Colour', value: 'Red' }],
    reply: null,
    createdAt: '2026-10-20T10:00:00.000Z',
    editedAt: null,
    ...overrides,
  };
}

const SUMMARY: RatingSummary = {
  ratingAvg: '4.30',
  ratingCount: 12,
  distribution: { 1: 0, 2: 1, 3: 1, 4: 2, 5: 8 },
};

function serveSummary(summary: RatingSummary | 'error') {
  server.use(
    mockApi(
      'get',
      '/products/{productId}/reviews/summary',
      ({ reply }) => (summary === 'error' ? reply.error(500, 'INTERNAL_ERROR') : reply.ok(summary)),
      { base: BFF_BASE },
    ),
  );
}

/** Serves pages in order; records each request's query string. */
function serveReviews(...pages: { data: Review[]; nextCursor: string | null }[]) {
  const queries: string[] = [];
  server.use(
    mockApi(
      'get',
      '/products/{productId}/reviews',
      ({ request, reply }) => {
        queries.push(decodeURIComponent(new URL(request.url).search));
        const page = pages[Math.min(queries.length, pages.length) - 1] ?? { data: [], nextCursor: null };
        return reply.ok(page.data, {
          nextCursor: page.nextCursor,
          hasMore: page.nextCursor !== null,
          limit: 5,
        });
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

function renderSection() {
  return renderWithProviders(<ProductReviews productId={PRODUCT_ID} sellerName="Nile Crafts" />);
}

describe('product reviews (spec 01 SF-05-R)', { timeout: 15_000 }, () => {
  it('summary: average, count and one row per star read as text', async () => {
    serveSummary(SUMMARY);
    serveReviews({ data: [review()], nextCursor: null });
    renderSection();
    const rows = await screen.findByRole('list', { name: 'Rating summary' });
    expect(within(rows).getByText('5 stars: 8 reviews')).toBeDefined();
    expect(within(rows).getByText('2 stars: 1 review')).toBeDefined();
    expect(within(rows).getByText('1 star: 0 reviews')).toBeDefined();
    expect(screen.getByText('Rated 4.3 out of 5 from 12 reviews')).toBeDefined();
    expect(screen.getByRole('region', { name: 'Reviews' }).id).toBe('reviews');
  });

  it('a review: stars, title, body as text, reviewer, options, date, edited, seller reply', async () => {
    serveSummary(SUMMARY);
    serveReviews({
      data: [
        review({
          editedAt: '2026-10-21T10:00:00.000Z',
          reply: { body: 'Thanks, Mona!', createdAt: '2026-10-22T10:00:00.000Z' },
        }),
      ],
      nextCursor: null,
    });
    renderSection();
    const item = (await screen.findByRole('heading', { name: 'Great fit' })).closest('article');
    if (item === null) throw new Error('no review');
    expect(within(item).getByText('Rated 4 out of 5')).toBeDefined();
    expect(within(item).getByText(/Soft fabric\./).textContent).toBe('Soft fabric.\nRuns a little large.');
    expect(within(item).getByText('Mona A.')).toBeDefined();
    expect(within(item).getByText('Colour: Red')).toBeDefined();
    expect(within(item).getByText('Edited')).toBeDefined();
    expect(within(item).getByText('Reply from Nile Crafts')).toBeDefined();
    expect(within(item).getByText('Thanks, Mona!')).toBeDefined();
  });

  it('5 first, then "Show more reviews" asks for 10 with the cursor', async () => {
    serveSummary(SUMMARY);
    const queries = serveReviews(
      { data: [review({ title: 'First' })], nextCursor: 'c2' },
      { data: [review({ title: 'Second' })], nextCursor: null },
    );
    const view = renderSection();
    await screen.findByRole('heading', { name: 'First' });
    await view.user.click(screen.getByRole('button', { name: 'Show more reviews' }));
    await screen.findByRole('heading', { name: 'Second' });
    expect(queries).toEqual(['?limit=5&sort=-createdAt', '?limit=10&sort=-createdAt&cursor=c2']);
    expect(screen.queryByRole('button', { name: 'Show more reviews' })).toBeNull();
  });

  it('filters: star chips as rating[in], "With photos", sort; no match offers to show all', async () => {
    serveSummary(SUMMARY);
    const queries = serveReviews({ data: [review()], nextCursor: null }, { data: [], nextCursor: null });
    const view = renderSection();
    await screen.findByRole('heading', { name: 'Great fit' });
    const group = screen.getByRole('group', { name: 'Filter by rating' });
    await view.user.click(within(group).getByRole('button', { name: '5 stars' }));
    await view.user.click(within(group).getByRole('button', { name: '4 stars' }));
    expect(within(group).getByRole('button', { name: '4 stars' }).getAttribute('aria-pressed')).toBe('true');
    await view.user.click(within(group).getByRole('button', { name: 'With photos' }));
    await view.user.click(screen.getByRole('combobox', { name: 'Sort by' }));
    await view.user.click(screen.getByRole('option', { name: 'Lowest rated' }));
    await waitFor(() => {
      expect(queries.at(-1)).toBe('?limit=5&sort=rating&rating[in]=4,5&hasImages[eq]=true');
    });
    await view.user.click(await screen.findByRole('button', { name: 'Show all reviews' }));
    await waitFor(() => {
      expect(within(group).getByRole('button', { name: '5 stars' }).getAttribute('aria-pressed')).toBe(
        'false',
      );
    });
  });

  it('review photos open in the lightbox', async () => {
    serveSummary(SUMMARY);
    const image = {
      id: '01900000-0000-7000-8000-0000000000e1',
      urls: {
        thumb: 'https://media.test/t.webp',
        medium: 'https://media.test/m.webp',
        large: 'https://media.test/l.webp',
      },
      width: 1200,
      height: 900,
    };
    serveReviews({
      data: [review({ images: [image, { ...image, id: '01900000-0000-7000-8000-0000000000e2' }] })],
      nextCursor: null,
    });
    const view = renderSection();
    const photos = await screen.findByRole('list', { name: 'Photos from Mona A.' });
    await view.user.click(within(photos).getByRole('button', { name: 'Show photo 2 of 2' }));
    const dialog = screen.getByRole('dialog', { name: 'Photos from Mona A.' });
    expect(within(dialog).getByRole('status').textContent).toBe('Photo 2 of 2');
  });

  it('no reviews: says so, no filters and no list request', async () => {
    serveSummary({ ratingAvg: null, ratingCount: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
    const queries = serveReviews({ data: [], nextCursor: null });
    renderSection();
    expect(await screen.findByText('No reviews yet.')).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Filter by rating' })).toBeNull();
    expect(queries).toEqual([]);
  });

  it('a failed read stays inside the section with "Try again"', async () => {
    serveSummary('error');
    renderSection();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Reviews couldn't be loaded.");
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Reviews' })).toBeDefined();
  });
});
