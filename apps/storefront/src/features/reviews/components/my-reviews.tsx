'use client';

import { isApiError } from '@nile/api';
import { defaultErrorMessage, formatDate } from '@nile/domain';
import {
  Badge,
  Button,
  buttonVariants,
  cn,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingRegion,
  LoadMore,
  NileImage,
  PageHeader,
  Skeleton,
  StarRating,
  toast,
} from '@nile/ui';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { productPath } from '@/lib/routes';
import { reviewKeys } from '../api';
import { MY_REVIEWS_COPY as COPY } from '../copy';
import { REVIEW_TABS, reviewsTabHref, writeReviewPath, editReviewPath, type ReviewsTab } from '../lib/routes';
import {
  deleteReview,
  myReviewKeys,
  myReviewsListOptions,
  reviewableListOptions,
  type MyReview,
  type ReviewableItem,
} from '../my-api';

const SKELETON_ROWS = 3;

function correlationIdOf(error: unknown): string | undefined {
  return isApiError(error) ? (error.correlationId ?? undefined) : undefined;
}

function options(item: { readonly variantOptions: readonly { attribute: string; value: string }[] }): string {
  return item.variantOptions.map((option) => `${option.attribute}: ${option.value}`).join(' · ');
}

function Loading() {
  return (
    <LoadingRegion className="space-y-3">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <Skeleton key={index} className="h-24" />
      ))}
    </LoadingRegion>
  );
}

function ReviewableRow({ item }: { readonly item: ReviewableItem }) {
  const variant = options(item);
  return (
    <article className="flex flex-wrap items-start gap-4 py-4">
      <NileImage
        image={item.product.primaryImage}
        alt=""
        sizes="80px"
        placeholder="product"
        className="size-20 shrink-0 rounded-md bg-muted"
      />
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <h2 className="text-base font-medium">{item.product.name}</h2>
        {variant === '' ? null : <p className="text-muted-foreground">{variant}</p>}
        <p className="text-muted-foreground">
          {COPY.order(item.orderNumber)} · {COPY.delivered(formatDate(item.deliveredAt))}
        </p>
        <p>{COPY.reviewBy(formatDate(item.reviewWindowEndsAt))}</p>
      </div>
      <Link href={writeReviewPath(item.orderItemId)} className={buttonVariants({ size: 'sm' })}>
        {COPY.writeReview}
      </Link>
    </article>
  );
}

function ToReview() {
  const items = useInfiniteQuery(reviewableListOptions());
  if (items.isPending) return <Loading />;
  if (items.isError) {
    return (
      <ErrorState
        message={COPY.loadFailed}
        onRetry={() => void items.refetch()}
        retrying={items.isFetching}
        correlationId={correlationIdOf(items.error)}
      />
    );
  }
  const rows = items.data.pages.flatMap((page) => page.data);
  if (rows.length === 0) return <EmptyState title={COPY.toReviewEmpty} />;
  return (
    <div>
      <ul className="divide-y divide-border">
        {rows.map((item) => (
          <li key={item.orderItemId}>
            <ReviewableRow item={item} />
          </li>
        ))}
      </ul>
      <LoadMore
        hasMore={items.hasNextPage}
        loading={items.isFetchingNextPage}
        loadedCount={rows.length}
        onLoadMore={() => void items.fetchNextPage()}
      />
    </div>
  );
}

function WrittenRow({
  review,
  highlighted,
  onDelete,
}: {
  readonly review: MyReview;
  readonly highlighted: boolean;
  readonly onDelete: (review: MyReview) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    // A notification link (`?review=<id>`) lands on this review (spec 01 SF-24).
    if (highlighted) ref.current?.scrollIntoView({ block: 'center' });
  }, [highlighted]);
  const variant = options(review);
  return (
    <article
      ref={ref}
      tabIndex={highlighted ? -1 : undefined}
      className={cn('space-y-2 py-4', highlighted ? 'rounded-md bg-accent px-3 outline-2 outline-ring' : '')}
    >
      <div className="flex flex-wrap items-start gap-4">
        <NileImage
          image={review.product.primaryImage}
          alt=""
          sizes="80px"
          placeholder="product"
          className="size-20 shrink-0 rounded-md bg-muted"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-medium">
            <Link href={productPath(review.product.slug)} className="hover:underline">
              {review.product.name}
            </Link>
          </h2>
          {variant === '' ? null : <p className="text-sm text-muted-foreground">{variant}</p>}
          <StarRating rating={review.rating} />
          {review.status === 'hidden' ? (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="neutral">{COPY.hidden}</Badge>
              <span className="text-muted-foreground">{COPY.hiddenNote}</span>
            </p>
          ) : null}
        </div>
      </div>
      {review.title === null ? null : <h3 className="font-medium">{review.title}</h3>}
      {review.body === null ? null : (
        // Plain text from the customer, line breaks kept; an excerpt of three lines.
        <p className="line-clamp-3 whitespace-pre-line text-sm">{review.body}</p>
      )}
      <p className="text-sm text-muted-foreground">
        <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
      </p>
      {review.reply === null ? null : (
        <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
          <p className="font-medium">{COPY.sellerReply}</p>
          <p className="whitespace-pre-line">{review.reply.body}</p>
        </div>
      )}
      <div className="flex gap-2">
        {review.canEdit ? (
          <Link
            href={editReviewPath(review.id)}
            aria-label={COPY.editNamed(review.product.name)}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {COPY.edit}
          </Link>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          aria-label={COPY.deleteNamed(review.product.name)}
          onClick={() => {
            onDelete(review);
          }}
        >
          {COPY.delete}
        </Button>
      </div>
    </article>
  );
}

function Written({ highlight }: { readonly highlight: string | null }) {
  const queryClient = useQueryClient();
  const reviews = useInfiniteQuery(myReviewsListOptions());
  const [deleting, setDeleting] = useState<MyReview | null>(null);

  const confirmDelete = async () => {
    if (deleting === null) return;
    try {
      await deleteReview(deleting.id);
      toast({ title: COPY.deleted, tone: 'success' });
    } catch (error) {
      if (!isApiError(error, 'REVIEW_NOT_FOUND')) {
        toast({
          title: defaultErrorMessage(isApiError(error) ? error.code : 'NETWORK_ERROR'),
          tone: 'destructive',
          correlationId: correlationIdOf(error),
        });
        throw error;
      }
      toast({ title: COPY.gone });
    }
    // Both tabs change: the product can be reviewed again while its window is open.
    void queryClient.invalidateQueries({ queryKey: myReviewKeys.all() });
    void queryClient.invalidateQueries({ queryKey: reviewKeys.all() });
  };

  if (reviews.isPending) return <Loading />;
  if (reviews.isError) {
    return (
      <ErrorState
        message={COPY.loadFailed}
        onRetry={() => void reviews.refetch()}
        retrying={reviews.isFetching}
        correlationId={correlationIdOf(reviews.error)}
      />
    );
  }
  const rows = reviews.data.pages.flatMap((page) => page.data);
  return (
    <div>
      {rows.length === 0 ? (
        <EmptyState title={COPY.writtenEmpty} />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((review) => (
            <li key={review.id}>
              <WrittenRow review={review} highlighted={review.id === highlight} onDelete={setDeleting} />
            </li>
          ))}
        </ul>
      )}
      <LoadMore
        hasMore={reviews.hasNextPage}
        loading={reviews.isFetchingNextPage}
        loadedCount={rows.length}
        onLoadMore={() => void reviews.fetchNextPage()}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={COPY.deleteTitle}
        description={deleting === null ? '' : COPY.deleteConfirm(deleting.product.name)}
        confirmLabel={COPY.delete}
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export interface MyReviewsProps {
  /** `?tab=` when valid; null picks "To review" when it has items, else "Written" (spec 01 SF-24). */
  readonly tab: ReviewsTab | null;
  /** `?review=<id>` from a notification: the "Written" tab with that review highlighted. */
  readonly highlight: string | null;
}

/** SF-24 My reviews: tabs "To review" / "Written" in the URL. */
export function MyReviews({ tab, highlight }: MyReviewsProps) {
  const reviewable = useInfiniteQuery({
    ...reviewableListOptions(),
    enabled: tab === null && highlight === null,
  });
  const firstHasItems = (reviewable.data?.pages[0]?.data.length ?? 0) > 0;
  const current: ReviewsTab | null =
    tab ??
    (highlight !== null ? 'written' : reviewable.isPending ? null : firstHasItems ? 'to-review' : 'written');

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      <nav aria-label={COPY.tabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {REVIEW_TABS.map((key) => (
            <li key={key}>
              <Link
                href={reviewsTabHref(key)}
                aria-current={key === current ? 'page' : undefined}
                className={buttonVariants({ variant: key === current ? 'primary' : 'outline', size: 'sm' })}
              >
                {COPY.tabs[key]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {current === null ? (
        <Loading />
      ) : current === 'to-review' ? (
        <ToReview />
      ) : (
        <Written highlight={highlight} />
      )}
    </div>
  );
}
