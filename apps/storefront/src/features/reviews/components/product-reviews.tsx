'use client';

import { isApiError } from '@nile/api';
import { formatDate, formatRating, MAX_RATING } from '@nile/domain';
import {
  Button,
  EmptyState,
  ErrorState,
  Label,
  Lightbox,
  LoadingRegion,
  LoadMore,
  NileImage,
  RatingStars,
  Select,
  Skeleton,
  StarRating,
  UI_COPY,
  type LightboxImage,
} from '@nile/ui';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { browserApi } from '@/lib/browser-api';
import {
  DEFAULT_REVIEW_FILTERS,
  REVIEW_SORTS,
  REVIEWS_SECTION_ID,
  reviewListOptions,
  reviewSummaryOptions,
  type RatingSummary,
  type Review,
  type ReviewFilters,
  type ReviewSort,
} from '../api';
import { REVIEWS_COPY } from '../copy';

const STAR_VALUES = Array.from({ length: MAX_RATING }, (_, index) => MAX_RATING - index);
const CHIP =
  'inline-flex min-h-9 items-center rounded-full border px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground border-input hover:bg-muted aria-pressed:hover:bg-primary-hover';

function correlationIdOf(error: unknown): string | undefined {
  return isApiError(error) ? (error.correlationId ?? undefined) : undefined;
}

function Summary({ summary }: { readonly summary: RatingSummary }) {
  return (
    <div className="space-y-3">
      {summary.ratingAvg === null ? null : (
        <p className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold">{formatRating(summary.ratingAvg)}</span>
          <span className="text-muted-foreground">{REVIEWS_COPY.outOfFive}</span>
        </p>
      )}
      <RatingStars avg={summary.ratingAvg} count={summary.ratingCount} />
      <ul aria-label={REVIEWS_COPY.summary} className="space-y-1 text-sm">
        {STAR_VALUES.map((stars) => {
          const count = summary.distribution[stars as keyof RatingSummary['distribution']];
          const share = summary.ratingCount === 0 ? 0 : (count / summary.ratingCount) * 100;
          return (
            <li key={stars} className="grid grid-cols-[4rem_minmax(0,1fr)_2.5rem] items-center gap-2">
              <span className="sr-only">{REVIEWS_COPY.distributionRow(stars, count)}</span>
              <span aria-hidden="true">{REVIEWS_COPY.stars(stars)}</span>
              {/* Width as an SVG attribute: no inline style under the CSP (CLAUDE.md §7). */}
              <svg aria-hidden="true" viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2 w-full">
                <rect width="100" height="8" rx="4" className="fill-muted" />
                <rect width={share} height="8" rx="4" className="fill-nile-gold" />
              </svg>
              <span aria-hidden="true" className="text-end tabular-nums">
                {count}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReviewPhotos({ review }: { readonly review: Review }) {
  const [index, setIndex] = useState<number | null>(null);
  const label = REVIEWS_COPY.reviewPhotos(review.reviewer.displayName);
  const photos: LightboxImage[] = review.images.map((image) => ({ ...image, alt: label }));
  return (
    <>
      <ul aria-label={label} className="flex flex-wrap gap-2">
        {photos.map((photo, position) => (
          <li key={photo.id}>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={UI_COPY.showPhoto(position + 1, photos.length)}
              className="block size-16 overflow-hidden rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={() => {
                setIndex(position);
              }}
            >
              <NileImage image={photo} alt="" sizes="64px" placeholder="product" className="size-full" />
            </button>
          </li>
        ))}
      </ul>
      <Lightbox images={photos} index={index} onIndexChange={setIndex} title={label} />
    </>
  );
}

function ReviewItem({ review, sellerName }: { readonly review: Review; readonly sellerName: string }) {
  const options = review.variantOptions.map((option) => `${option.attribute}: ${option.value}`).join(' · ');
  return (
    <article className="space-y-2 py-4">
      <StarRating rating={review.rating} />
      {review.title === null ? null : <h3 className="font-medium">{review.title}</h3>}
      {/* Plain text from the customer: rendered as text, line breaks kept (CLAUDE.md §7). */}
      {review.body === null ? null : <p className="whitespace-pre-line">{review.body}</p>}
      <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
        <span>{review.reviewer.displayName}</span>
        {options === '' ? null : <span>{options}</span>}
        <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
        {review.editedAt === null ? null : <span>{REVIEWS_COPY.edited}</span>}
      </p>
      {review.images.length === 0 ? null : <ReviewPhotos review={review} />}
      {review.reply === null ? null : (
        <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
          <p className="font-medium">
            {REVIEWS_COPY.replyFrom(sellerName)}{' '}
            <time dateTime={review.reply.createdAt} className="font-normal text-muted-foreground">
              {formatDate(review.reply.createdAt)}
            </time>
          </p>
          <p className="whitespace-pre-line">{review.reply.body}</p>
        </div>
      )}
    </article>
  );
}

function Filters({
  filters,
  onChange,
}: {
  readonly filters: ReviewFilters;
  readonly onChange: (filters: ReviewFilters) => void;
}) {
  const sortId = useId();
  const toggleStars = (stars: number) => {
    const ratings = filters.ratings.includes(stars)
      ? filters.ratings.filter((value) => value !== stars)
      : [...filters.ratings, stars].sort((a, b) => a - b);
    onChange({ ...filters, ratings });
  };
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div role="group" aria-label={REVIEWS_COPY.filterByRating} className="flex flex-wrap gap-2">
        {STAR_VALUES.map((stars) => (
          <button
            key={stars}
            type="button"
            className={CHIP}
            aria-pressed={filters.ratings.includes(stars)}
            onClick={() => {
              toggleStars(stars);
            }}
          >
            {REVIEWS_COPY.stars(stars)}
          </button>
        ))}
        <button
          type="button"
          className={CHIP}
          aria-pressed={filters.withPhotos}
          onClick={() => {
            onChange({ ...filters, withPhotos: !filters.withPhotos });
          }}
        >
          {REVIEWS_COPY.withPhotos}
        </button>
      </div>
      <div className="space-y-1">
        <Label htmlFor={sortId}>{REVIEWS_COPY.sortLabel}</Label>
        <Select
          id={sortId}
          className="min-w-44"
          value={filters.sort}
          onValueChange={(sort) => {
            onChange({ ...filters, sort: sort as ReviewSort });
          }}
          options={(Object.keys(REVIEW_SORTS) as ReviewSort[]).map((key) => ({
            value: key,
            label: REVIEWS_COPY.sorts[key],
          }))}
        />
      </div>
    </div>
  );
}

function ReviewList({
  productId,
  sellerName,
  filters,
  onClearFilters,
}: {
  readonly productId: string;
  readonly sellerName: string;
  readonly filters: ReviewFilters;
  readonly onClearFilters: () => void;
}) {
  const reviews = useInfiniteQuery({
    ...reviewListOptions(browserApi, productId, filters),
    placeholderData: keepPreviousData,
  });
  if (reviews.isPending) {
    return (
      <LoadingRegion className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </LoadingRegion>
    );
  }
  if (reviews.isError) {
    return (
      <ErrorState
        message={REVIEWS_COPY.loadFailed}
        onRetry={() => void reviews.refetch()}
        retrying={reviews.isFetching}
        correlationId={correlationIdOf(reviews.error)}
      />
    );
  }
  const items = reviews.data.pages.flatMap((page) => page.data);
  if (items.length === 0) {
    return (
      <EmptyState
        title={REVIEWS_COPY.noMatches}
        action={
          <Button variant="outline" onClick={onClearFilters}>
            {REVIEWS_COPY.clearFilters}
          </Button>
        }
      />
    );
  }
  return (
    <div aria-busy={reviews.isPlaceholderData}>
      <ul
        className={reviews.isPlaceholderData ? 'divide-y divide-border opacity-60' : 'divide-y divide-border'}
      >
        {items.map((review) => (
          <li key={review.id}>
            <ReviewItem review={review} sellerName={sellerName} />
          </li>
        ))}
      </ul>
      <LoadMore
        hasMore={reviews.hasNextPage}
        loading={reviews.isFetchingNextPage}
        loadedCount={items.length}
        onLoadMore={() => void reviews.fetchNextPage()}
        label={REVIEWS_COPY.showMore}
      />
    </div>
  );
}

export interface ProductReviewsProps {
  readonly productId: string;
  /** The product's seller, named on replies ("Reply from {businessName}"). */
  readonly sellerName: string;
}

/**
 * SF-05-R reviews section (spec 01 §10.3 item 5): summary with the distribution, star and photo filters, sort,
 * 5 reviews then 10 more per "Show more reviews". Read in the browser after the page; its failures stay inside
 * the section and never break the product page. No "write a review" here: reviews start from an order (SF-24).
 */
export function ProductReviews({ productId, sellerName }: ProductReviewsProps) {
  const headingId = useId();
  const [filters, setFilters] = useState<ReviewFilters>(DEFAULT_REVIEW_FILTERS);
  const summary = useQuery(reviewSummaryOptions(browserApi, productId));

  let body;
  if (summary.isPending) {
    body = (
      <LoadingRegion>
        <Skeleton className="h-32" />
      </LoadingRegion>
    );
  } else if (summary.isError) {
    body = (
      <ErrorState
        message={REVIEWS_COPY.loadFailed}
        onRetry={() => void summary.refetch()}
        retrying={summary.isFetching}
        correlationId={correlationIdOf(summary.error)}
      />
    );
  } else if (summary.data.ratingCount === 0) {
    body = <p className="text-muted-foreground">{REVIEWS_COPY.noReviews}</p>;
  } else {
    body = (
      <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Summary summary={summary.data} />
        <div className="space-y-4">
          <Filters filters={filters} onChange={setFilters} />
          <ReviewList
            productId={productId}
            sellerName={sellerName}
            filters={filters}
            onClearFilters={() => {
              setFilters(DEFAULT_REVIEW_FILTERS);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <section id={REVIEWS_SECTION_ID} aria-labelledby={headingId} className="scroll-mt-4 space-y-4">
      <h2 id={headingId} className="text-xl font-semibold">
        {REVIEWS_COPY.heading}
      </h2>
      {body}
    </section>
  );
}
