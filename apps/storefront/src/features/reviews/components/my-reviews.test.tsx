// @vitest-environment jsdom
import type * as Media from '@nile/media';
import { fixtureId, imageFactory, mediaFactory, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import type { MyReview, ReviewableItem } from '../my-api';
import { MyReviews } from './my-reviews';
import { EditReview, WriteReview } from './review-form';
import { WriteReviewLink } from './write-review-link';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/use-has-session', () => ({ useHasSession: () => true }));
vi.mock('@nile/media', async (importOriginal) => {
  const media = await importOriginal<typeof Media>();
  return {
    ...media,
    // jsdom can neither decode images nor make `blob:` previews.
    useImageUploads: (options: Parameters<typeof media.useImageUploads>[0]) =>
      media.useImageUploads({
        ...options,
        decode: () => Promise.resolve({ width: 800, height: 600 }),
        previews: { create: (file) => `blob:${(file as File).name}`, revoke: () => undefined },
      }),
  };
});

const server = setupMswServer();

beforeEach(() => {
  push.mockReset();
});

const ITEM_ID = fixtureId(0xa01);
const REVIEW_ID = fixtureId(0xa02);

function reviewable(overrides: Partial<ReviewableItem> = {}): ReviewableItem {
  return {
    orderItemId: ITEM_ID,
    orderId: fixtureId(0x900),
    orderNumber: 'NM-2026-000001',
    product: { id: fixtureId(0x702), name: 'Linen shirt', primaryImage: null },
    variantOptions: [{ attribute: 'Size', value: 'M' }],
    deliveredAt: '2026-10-20T10:00:00.000Z',
    reviewWindowEndsAt: '2026-12-19T10:00:00.000Z',
    ...overrides,
  };
}

function myReview(overrides: Partial<MyReview> = {}): MyReview {
  return {
    id: REVIEW_ID,
    productId: fixtureId(0x702),
    product: { id: fixtureId(0x702), slug: 'linen-shirt', name: 'Linen shirt', primaryImage: null },
    status: 'published',
    canEdit: true,
    rating: 4,
    title: 'Great fit',
    body: 'Soft fabric.',
    images: [],
    reviewer: { displayName: 'Mona A.' },
    variantOptions: [{ attribute: 'Size', value: 'M' }],
    reply: null,
    createdAt: '2026-10-21T10:00:00.000Z',
    editedAt: null,
    ...overrides,
  };
}

function serveReviewable(items: ReviewableItem[]) {
  const limits: string[] = [];
  server.use(
    mockApi(
      'get',
      '/me/reviewable-items',
      ({ request, reply }) => {
        limits.push(new URL(request.url).searchParams.get('limit') ?? '');
        return reply.ok(items, { nextCursor: null, hasMore: false, limit: 20 });
      },
      { base: BFF_BASE },
    ),
  );
  return limits;
}

function serveWritten(reviews: MyReview[]) {
  let calls = 0;
  server.use(
    mockApi(
      'get',
      '/me/reviews',
      ({ reply }) => {
        calls += 1;
        return reply.ok(reviews, { nextCursor: null, hasMore: false, limit: 20 });
      },
      { base: BFF_BASE },
    ),
  );
  return () => calls;
}

describe('my reviews (spec 01 SF-24)', { timeout: 20_000 }, () => {
  it('without ?tab opens "To review" when it has items: product, order, dates, Write a review', async () => {
    serveReviewable([reviewable()]);
    renderWithProviders(<MyReviews tab={null} highlight={null} />);
    expect(await screen.findByRole('heading', { name: 'Linen shirt' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'To review' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('Size: M')).toBeDefined();
    expect(screen.getByText(/Order NM-2026-000001 · Delivered 20 Oct 2026/)).toBeDefined();
    expect(screen.getByText('Review by 19 Dec 2026')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Write a review' }).getAttribute('href')).toBe(
      `/account/reviews/write?item=${ITEM_ID}`,
    );
  });

  it('without ?tab and nothing to review: "Written"', async () => {
    serveReviewable([]);
    serveWritten([myReview()]);
    renderWithProviders(<MyReviews tab={null} highlight={null} />);
    expect(await screen.findByRole('link', { name: 'Linen shirt' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Written' }).getAttribute('aria-current')).toBe('page');
  });

  it('"To review" empty', async () => {
    serveReviewable([]);
    renderWithProviders(<MyReviews tab="to-review" highlight={null} />);
    expect(
      await screen.findByText(
        'Nothing to review right now. Products you receive can be reviewed for 60 days.',
      ),
    ).toBeDefined();
  });

  it('"Written": stars, text, Edit only when canEdit, hidden note, seller reply', async () => {
    serveWritten([
      myReview({ reply: { body: 'Thank you!', createdAt: '2026-10-22T10:00:00.000Z' } }),
      myReview({
        id: fixtureId(0xa03),
        product: { id: fixtureId(0x703), slug: 'wool-scarf', name: 'Wool scarf', primaryImage: null },
        status: 'hidden',
        canEdit: false,
      }),
    ]);
    renderWithProviders(<MyReviews tab="written" highlight={null} />);
    const shirt = (await screen.findByRole('link', { name: 'Linen shirt' })).closest('article');
    const scarf = screen.getByRole('link', { name: 'Wool scarf' }).closest('article');
    if (shirt === null || scarf === null) throw new Error('no rows');
    expect(within(shirt).getByText('Rated 4 out of 5')).toBeDefined();
    expect(within(shirt).getByText("Seller's reply")).toBeDefined();
    expect(
      within(shirt).getByRole('link', { name: 'Edit your review of Linen shirt' }).getAttribute('href'),
    ).toBe(`/account/reviews/${REVIEW_ID}/edit`);
    expect(within(scarf).getByText('Hidden by Nile')).toBeDefined();
    expect(within(scarf).getByText("This review isn't shown on the product page.")).toBeDefined();
    expect(within(scarf).queryByRole('link', { name: /Edit/ })).toBeNull();
  });

  it('?review=<id> opens "Written" with that review highlighted', async () => {
    serveWritten([myReview()]);
    renderWithProviders(<MyReviews tab={null} highlight={REVIEW_ID} />);
    const row = (await screen.findByRole('link', { name: 'Linen shirt' })).closest('article');
    expect(row?.getAttribute('tabindex')).toBe('-1');
  });

  it('delete: asks first, DELETE, then both tabs are read again', async () => {
    const writtenCalls = serveWritten([myReview()]);
    const deletes: string[] = [];
    server.use(
      http.delete(`${BFF_BASE}/me/reviews/:reviewId`, ({ params }) => {
        deletes.push(String(params.reviewId));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const view = renderWithProviders(
      <>
        <MyReviews tab="written" highlight={null} />
        <Toaster />
      </>,
    );
    await view.user.click(await screen.findByRole('button', { name: 'Delete your review of Linen shirt' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete review' });
    expect(
      within(dialog).getByText(
        'Delete your review of Linen shirt? You can write a new one while the review period is open.',
      ),
    ).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Review deleted.')).toBeDefined();
    expect(deletes).toEqual([REVIEW_ID]);
    await waitFor(() => {
      expect(writtenCalls()).toBe(2);
    });
  });
});

const STORAGE_URL = 'http://storage.test/nile-media';
const CORS = { 'Access-Control-Allow-Origin': '*' };

/** Each upload is ready at once; records the media ids. */
function serveUploads() {
  const ids: string[] = [];
  server.use(
    http.options(
      STORAGE_URL,
      () =>
        new HttpResponse(null, {
          status: 204,
          headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': '*' },
        }),
    ),
    mockApi(
      'post',
      '/media/uploads',
      ({ reply }) => {
        const media = mediaFactory();
        ids.push(media.id);
        return reply.created({
          media,
          upload: { url: STORAGE_URL, fields: { key: 'k' }, expiresAt: '2999-01-01T00:00:00Z' },
        });
      },
      { base: BFF_BASE },
    ),
    http.post(STORAGE_URL, () => new HttpResponse(null, { status: 204, headers: CORS })),
    mockApi(
      'post',
      '/media/uploads/{mediaId}/complete',
      ({ params, reply }) =>
        reply.ok(mediaFactory({ id: String(params.mediaId), status: 'ready', image: imageFactory() })),
      { base: BFF_BASE },
    ),
  );
  return ids;
}

function serveCreate(answer: (body: unknown) => Response) {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${BFF_BASE}/reviews`, async ({ request }) => {
      const body = await request.json();
      bodies.push(body);
      return answer(body);
    }),
  );
  return bodies;
}

const created = () => HttpResponse.json({ success: true, data: myReview() }, { status: 201 });

describe('write a review (spec 01 SF-25)', { timeout: 20_000 }, () => {
  it('an item not in the reviewable list: "This item can\'t be reviewed."', async () => {
    serveReviewable([reviewable({ orderItemId: fixtureId(0xbbb) })]);
    renderWithProviders(<WriteReview orderItemId={ITEM_ID} />);
    expect(await screen.findByText("This item can't be reviewed.")).toBeDefined();
    expect(screen.getByRole('link', { name: 'Your reviews' }).getAttribute('href')).toBe('/account/reviews');
  });

  it('the rating is required; a rating alone is a review (empty fields left out)', async () => {
    const limits = serveReviewable([reviewable()]);
    const bodies = serveCreate(created);
    const view = renderWithProviders(
      <>
        <WriteReview orderItemId={ITEM_ID} />
        <Toaster />
      </>,
    );
    await view.user.click(await screen.findByRole('button', { name: 'Publish review' }));
    expect(await screen.findByText('Choose a rating.')).toBeDefined();
    expect(bodies).toEqual([]);
    await view.user.click(screen.getByRole('radio', { name: '5 stars' }));
    await view.user.type(screen.getByRole('textbox', { name: 'Title' }), '   ');
    await view.user.click(screen.getByRole('button', { name: 'Publish review' }));
    expect(await screen.findByText('Thanks, your review is published.')).toBeDefined();
    expect(bodies).toEqual([{ orderItemId: ITEM_ID, rating: 5 }]);
    expect(push).toHaveBeenCalledWith('/account/reviews?tab=written');
    // Every reviewable item is read at the largest page size (again after publishing: it left the list).
    expect(new Set(limits)).toEqual(new Set(['100']));
  });

  it('with text and a photo: trimmed fields and the media id; Publish waits for the upload', async () => {
    serveReviewable([reviewable()]);
    const ids = serveUploads();
    const bodies = serveCreate(created);
    const view = renderWithProviders(<WriteReview orderItemId={ITEM_ID} />);
    await view.user.click(await screen.findByRole('radio', { name: '4 stars' }));
    await view.user.type(screen.getByRole('textbox', { name: 'Title' }), '  Great fit ');
    await view.user.type(screen.getByRole('textbox', { name: /^Review/ }), 'Soft fabric.');
    expect(screen.getByText('12 / 2000')).toBeDefined();
    await view.user.upload(
      screen.getByLabelText('Photos'),
      new File(['png'], 'shirt.png', { type: 'image/png' }),
    );
    expect(await screen.findByText('Ready')).toBeDefined();
    await view.user.click(screen.getByRole('button', { name: 'Publish review' }));
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    expect(bodies[0]).toEqual({
      orderItemId: ITEM_ID,
      rating: 4,
      title: 'Great fit',
      body: 'Soft fabric.',
      imageMediaIds: ids,
    });
  });

  it.each([
    ['REVIEW_ALREADY_EXISTS', 409, "You've already reviewed this product."],
    ['REVIEW_WINDOW_CLOSED', 422, 'The review period for this item has ended.'],
    ['REVIEW_NOT_ALLOWED', 422, "This item can't be reviewed."],
  ] as const)('%s: "%s"', async (code, status, message) => {
    serveReviewable([reviewable()]);
    serveCreate(() =>
      HttpResponse.json(
        { success: false, error: { code, message: code }, correlationId: 'corr-1' },
        { status },
      ),
    );
    const view = renderWithProviders(<WriteReview orderItemId={ITEM_ID} />);
    await view.user.click(await screen.findByRole('radio', { name: '3 stars' }));
    await view.user.click(screen.getByRole('button', { name: 'Publish review' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(message);
    if (code === 'REVIEW_ALREADY_EXISTS') {
      expect(within(alert).getByRole('link', { name: 'See your reviews' }).getAttribute('href')).toBe(
        '/account/reviews?tab=written',
      );
    }
    expect(push).not.toHaveBeenCalled();
  });
});

function serveReview(review: MyReview | 'not-found') {
  server.use(
    mockApi(
      'get',
      '/me/reviews/{reviewId}',
      ({ reply }) => (review === 'not-found' ? reply.error(404, 'REVIEW_NOT_FOUND') : reply.ok(review)),
      { base: BFF_BASE },
    ),
  );
}

function servePatch() {
  const bodies: unknown[] = [];
  server.use(
    http.patch(`${BFF_BASE}/me/reviews/:reviewId`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ success: true, data: myReview({ title: null }) });
    }),
  );
  return bodies;
}

describe('edit a review (spec 01 SF-25)', { timeout: 20_000 }, () => {
  it('Save only after a change; sends only what changed, a cleared title as null', async () => {
    serveReview(myReview());
    const bodies = servePatch();
    const view = renderWithProviders(<EditReview reviewId={REVIEW_ID} />);
    const save = await screen.findByRole('button', { name: 'Save changes' });
    expect(save.hasAttribute('disabled')).toBe(true);
    await view.user.clear(screen.getByRole('textbox', { name: 'Title' }));
    await view.user.click(screen.getByRole('radio', { name: '2 stars' }));
    await view.user.click(save);
    await waitFor(() => {
      expect(bodies).toEqual([{ rating: 2, title: null }]);
    });
    expect(push).toHaveBeenCalledWith(`/account/reviews?review=${REVIEW_ID}`);
  });

  it('removing a photo sends the remaining photo ids whole', async () => {
    const first = imageFactory();
    const second = imageFactory();
    serveReview(myReview({ images: [first, second] }));
    const bodies = servePatch();
    const view = renderWithProviders(<EditReview reviewId={REVIEW_ID} />);
    await view.user.click(await screen.findByRole('button', { name: 'Remove Photo 1 of 2' }));
    await view.user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(bodies).toEqual([{ imageMediaIds: [second.id] }]);
    });
  });

  it('past the edit window: read-only with the reason', async () => {
    serveReview(myReview({ canEdit: false }));
    renderWithProviders(<EditReview reviewId={REVIEW_ID} />);
    expect(await screen.findByText('Reviews can be edited for 30 days after posting.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });

  it('REVIEW_NOT_FOUND: "This item no longer exists."', async () => {
    serveReview('not-found');
    renderWithProviders(<EditReview reviewId={REVIEW_ID} />);
    expect(await screen.findByText('This item no longer exists.')).toBeDefined();
  });
});

describe('SF-18 "Write a review" (SF-Q-16)', { timeout: 15_000 }, () => {
  it('shown for a reviewable item only, and only read for delivered parcels', async () => {
    const limits = serveReviewable([reviewable()]);
    const { rerender } = renderWithProviders(
      <>
        <WriteReviewLink orderItemId={ITEM_ID} productName="Linen shirt" enabled />
        <WriteReviewLink orderItemId={fixtureId(0xccc)} productName="Wool scarf" enabled />
      </>,
    );
    expect(
      (await screen.findByRole('link', { name: 'Write a review of Linen shirt' })).getAttribute('href'),
    ).toBe(`/account/reviews/write?item=${ITEM_ID}`);
    expect(screen.queryByRole('link', { name: 'Write a review of Wool scarf' })).toBeNull();
    expect(limits).toHaveLength(1);
    rerender(<WriteReviewLink orderItemId={ITEM_ID} productName="Linen shirt" enabled={false} />);
    expect(limits).toHaveLength(1);
  });
});
