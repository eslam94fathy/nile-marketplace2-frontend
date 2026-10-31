'use client';

import { isApiError } from '@nile/api';
import { formatDate, REVIEW_STATUS_LABELS, REVIEW_STATUSES } from '@nile/domain';
import {
  Badge,
  buttonVariants,
  DataTable,
  EmptyState,
  ErrorState,
  Label,
  PageHeader,
  REVIEW_STATUS_TONES,
  Select,
  StarRating,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { customerQuery } from '@/features/customers';
import { useSellerNames } from '@/features/lookups';
import { useProductNames } from '@/features/products';
import { productPath, reviewPath, ROUTES, sellerPath } from '@/lib/routes';
import { reviewsListOptions, type AdminReview } from '../api';
import { REVIEWS_COPY as COPY } from '../copy';
import {
  hasReviewFilters,
  parseReviewFilters,
  RATING_CEILINGS,
  reviewFiltersQuery,
  type RawReviewParams,
  type ReviewFilters,
} from '../lib/list-params';

const ALL = 'all';
const LINK = 'text-primary underline-offset-4 hover:underline';

const listHref = (filters: ReviewFilters): Route => {
  const query = reviewFiltersQuery(filters);
  return query === '' ? ROUTES.reviews : `${ROUTES.reviews}?${query}`;
};

/**
 * AD-30 Reviews: newest first, status and "n stars or fewer" in the URL; a product, seller or customer scope
 * comes from the AD-27, AD-05 and AD-26 links and is shown as a removable chip.
 */
export function ReviewsList({ params }: { readonly params: RawReviewParams }) {
  const filters = parseReviewFilters(params);
  const router = useRouter();
  const reviews = useInfiniteQuery(reviewsListOptions(filters));
  const rows = reviews.data?.pages.flatMap((page) => page.data) ?? [];
  const productName = useProductNames([...rows.map((review) => review.productId), filters.productId]);
  const sellerName = useSellerNames([...rows.map((review) => review.sellerId), filters.sellerId]);

  const columns: readonly DataTableColumn<AdminReview>[] = [
    {
      id: 'review',
      header: COPY.columns.review,
      cell: (review) => (
        <span className="flex max-w-md flex-col">
          <Link href={reviewPath(review.id)} className={`font-medium ${LINK}`}>
            {review.title ?? COPY.untitled}
          </Link>
          {/* Plain text from the customer, cut by CSS only (CLAUDE.md §7). */}
          {review.body === null ? null : (
            <span className="line-clamp-2 text-muted-foreground">{review.body}</span>
          )}
        </span>
      ),
    },
    {
      id: 'product',
      header: COPY.columns.product,
      cell: (review) => (
        <Link href={productPath(review.productId)} className={LINK}>
          {productName(review.productId) ?? COPY.shortId(review.productId)}
        </Link>
      ),
    },
    {
      id: 'seller',
      header: COPY.columns.seller,
      cell: (review) => (
        <Link href={sellerPath(review.sellerId)} className={LINK}>
          {sellerName(review.sellerId) ?? COPY.shortId(review.sellerId)}
        </Link>
      ),
    },
    { id: 'rating', header: COPY.columns.rating, cell: (review) => <StarRating rating={review.rating} /> },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (review) => (
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge
            value={review.status}
            labels={REVIEW_STATUS_LABELS.admin}
            tones={REVIEW_STATUS_TONES}
          />
          {(review.reply?.hiddenAt ?? null) === null ? null : (
            <Badge tone="neutral">{COPY.replyHidden}</Badge>
          )}
        </span>
      ),
    },
    { id: 'photos', header: COPY.columns.photos, align: 'end', cell: (review) => review.images.length },
    {
      id: 'date',
      header: COPY.columns.date,
      cell: (review) => <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      {reviews.isError ? (
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void reviews.refetch()}
          correlationId={isApiError(reviews.error) ? (reviews.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.caption}
          columns={columns}
          rows={rows}
          getRowId={(review) => review.id}
          loading={reviews.isPending}
          hasMore={reviews.hasNextPage}
          loadingMore={reviews.isFetchingNextPage}
          onLoadMore={() => void reviews.fetchNextPage()}
          toolbar={
            <Filters
              filters={filters}
              productName={productName}
              sellerName={sellerName}
              onChange={(next) => {
                router.push(listHref(next));
              }}
            />
          }
          empty={
            hasReviewFilters(filters) ? (
              <EmptyState
                title={COPY.emptyFiltered}
                action={
                  <Link href={ROUTES.reviews} className={buttonVariants({ variant: 'outline' })}>
                    {COPY.clearFilters}
                  </Link>
                }
              />
            ) : (
              <EmptyState title={COPY.empty} />
            )
          }
        />
      )}
    </div>
  );
}

function Filters({
  filters,
  productName,
  sellerName,
  onChange,
}: {
  readonly filters: ReviewFilters;
  readonly productName: (id: string) => string | null;
  readonly sellerName: (id: string) => string | null;
  readonly onChange: (next: ReviewFilters) => void;
}) {
  const statusId = useId();
  const ratingId = useId();
  const customer = useQuery({
    ...customerQuery(filters.customerId ?? ''),
    enabled: filters.customerId !== null,
  });
  const customerName =
    customer.data === undefined ? null : `${customer.data.firstName} ${customer.data.lastName}`.trim();

  const scopes = [
    ...(filters.productId === null
      ? []
      : [
          {
            key: 'product',
            label: COPY.productScope(productName(filters.productId) ?? COPY.shortId(filters.productId)),
            href: listHref({ ...filters, productId: null }),
          },
        ]),
    ...(filters.sellerId === null
      ? []
      : [
          {
            key: 'seller',
            label: COPY.sellerScope(sellerName(filters.sellerId) ?? COPY.shortId(filters.sellerId)),
            href: listHref({ ...filters, sellerId: null }),
          },
        ]),
    ...(filters.customerId === null
      ? []
      : [
          {
            key: 'customer',
            label: COPY.customerScope(customerName ?? COPY.shortId(filters.customerId)),
            href: listHref({ ...filters, customerId: null }),
          },
        ]),
  ];

  return (
    <div className="mb-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor={statusId}>{COPY.statusFilter}</Label>
          <Select
            id={statusId}
            options={[
              { value: ALL, label: COPY.allStatuses },
              ...REVIEW_STATUSES.map((status) => ({
                value: status,
                label: REVIEW_STATUS_LABELS.admin[status],
              })),
            ]}
            value={filters.status ?? ALL}
            onValueChange={(value) => {
              onChange({ ...filters, status: REVIEW_STATUSES.find((status) => status === value) ?? null });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={ratingId}>{COPY.ratingFilter}</Label>
          <Select
            id={ratingId}
            options={[
              { value: ALL, label: COPY.anyRating },
              ...RATING_CEILINGS.map((stars) => ({ value: String(stars), label: COPY.ratingAtMost(stars) })),
            ]}
            value={filters.rating === null ? ALL : String(filters.rating)}
            onValueChange={(value) => {
              onChange({
                ...filters,
                rating: RATING_CEILINGS.find((stars) => String(stars) === value) ?? null,
              });
            }}
          />
        </div>
      </div>
      {scopes.length === 0 ? null : (
        <ul aria-label={COPY.scopeLabel} className="flex flex-wrap gap-2">
          {scopes.map((scope) => (
            <li key={scope.key}>
              <span className="inline-flex min-h-9 items-center gap-1 rounded-full border border-input ps-3 text-sm">
                {scope.label}
                <Link
                  href={scope.href}
                  aria-label={COPY.removeScope(scope.label)}
                  className="inline-flex size-9 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X className="size-4" aria-hidden="true" />
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
