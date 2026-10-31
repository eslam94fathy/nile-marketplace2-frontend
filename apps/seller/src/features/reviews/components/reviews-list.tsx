'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError, type Schema } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields, formatDate } from '@nile/domain';
import { applyServerErrors } from '@nile/query';
import {
  Button,
  buttonVariants,
  EmptyState,
  ErrorState,
  Field,
  FormAlert,
  Input,
  Label,
  Lightbox,
  LoadMore,
  NileImage,
  PageHeader,
  Select,
  Skeleton,
  StarRating,
  Textarea,
  toast,
  UI_COPY,
  type LightboxImage,
} from '@nile/ui';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';
import { useNotApprovedHandler, useSellerAccess } from '@/features/profile';
import { productPath, ROUTES } from '@/lib/routes';
import {
  productChoicesQuery,
  REPLY_MAX,
  replyToReview,
  reviewKeys,
  reviewsListOptions,
  type SellerReview,
} from '../api';
import { REVIEWS_COPY as COPY } from '../copy';
import {
  hasReviewFilters,
  parseReviewFilters,
  reviewFiltersQuery,
  STAR_VALUES,
  type RawReviewParams,
  type ReviewFilters,
  type Stars,
} from '../lib/params';

const ALL_PRODUCTS = 'all';
const LINK = 'font-medium text-primary underline-offset-4 hover:underline';
const CHIP =
  'inline-flex min-h-9 items-center rounded-full border px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground border-input hover:bg-muted aria-pressed:hover:bg-primary-hover';

const listHref = (filters: ReviewFilters): Route => {
  const query = reviewFiltersQuery(filters);
  return query === '' ? ROUTES.reviews : `${ROUTES.reviews}?${query}`;
};

/** SE-20 Reviews: filters in the URL (`?product=&rating=&replied=&from=`), newest first, "Load more". */
export function ReviewsList({ params }: { readonly params: RawReviewParams }) {
  const filters = parseReviewFilters(params);
  const router = useRouter();
  const reviews = useInfiniteQuery(reviewsListOptions(filters));
  const rows = reviews.data?.pages.flatMap((page) => page.data) ?? [];
  const navigate = (next: ReviewFilters, replace = false) => {
    if (replace) router.replace(listHref(next));
    else router.push(listHref(next));
  };

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      <Filters filters={filters} onChange={navigate} />
      {reviews.isError ? (
        <ErrorState
          message={COPY.listFailed}
          onRetry={() => void reviews.refetch()}
          correlationId={isApiError(reviews.error) ? (reviews.error.correlationId ?? undefined) : undefined}
        />
      ) : reviews.isPending ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : rows.length === 0 ? (
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
      ) : (
        <>
          <ul aria-label={COPY.listLabel} className="divide-y divide-border">
            {rows.map((review) => (
              <li key={review.id}>
                <ReviewItem review={review} />
              </li>
            ))}
          </ul>
          <LoadMore
            hasMore={reviews.hasNextPage}
            loading={reviews.isFetchingNextPage}
            loadedCount={rows.length}
            onLoadMore={() => void reviews.fetchNextPage()}
          />
        </>
      )}
    </div>
  );
}

function Filters({
  filters,
  onChange,
}: {
  readonly filters: ReviewFilters;
  readonly onChange: (next: ReviewFilters, replace?: boolean) => void;
}) {
  const id = useId();
  const products = useQuery(productChoicesQuery());
  const toggleStars = (stars: Stars) => {
    const ratings = filters.ratings.includes(stars)
      ? filters.ratings.filter((value) => value !== stars)
      : [...filters.ratings, stars].sort((a, b) => a - b);
    onChange({ ...filters, ratings });
  };
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-1">
        <Label htmlFor={`${id}-product`}>{COPY.product}</Label>
        <Select
          id={`${id}-product`}
          className="min-w-56"
          disabled={products.isPending}
          value={filters.productId ?? ALL_PRODUCTS}
          onValueChange={(value) => {
            onChange({ ...filters, productId: value === ALL_PRODUCTS ? null : value });
          }}
          options={[
            { value: ALL_PRODUCTS, label: COPY.allProducts },
            ...(products.data ?? []).map((product) => ({ value: product.id, label: product.name })),
          ]}
        />
        {products.isError ? <p className="text-sm text-destructive">{COPY.productsFailed}</p> : null}
      </div>
      <div role="group" aria-label={COPY.filterByRating} className="flex flex-wrap gap-2">
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
            {COPY.stars(stars)}
          </button>
        ))}
        <button
          type="button"
          className={CHIP}
          aria-pressed={filters.notReplied}
          onClick={() => {
            onChange({ ...filters, notReplied: !filters.notReplied });
          }}
        >
          {COPY.notReplied}
        </button>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-from`}>{COPY.from}</Label>
        <Input
          id={`${id}-from`}
          type="date"
          value={filters.from ?? ''}
          onChange={(event) => {
            onChange({ ...filters, from: event.target.value === '' ? null : event.target.value }, true);
          }}
        />
      </div>
    </div>
  );
}

function ReviewPhotos({ review }: { readonly review: SellerReview }) {
  const [index, setIndex] = useState<number | null>(null);
  const label = COPY.reviewPhotos(review.reviewer.displayName);
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

function ReviewItem({ review }: { readonly review: SellerReview }) {
  const access = useSellerAccess();
  const reasonId = useId();
  const [replying, setReplying] = useState(false);
  const options = review.variantOptions.map((option) => `${option.attribute}: ${option.value}`).join(' · ');
  return (
    <article className="space-y-2 py-4">
      <Link href={productPath(review.product.id)} className={LINK}>
        {review.product.name}
      </Link>
      <StarRating rating={review.rating} />
      {review.title === null ? null : <h2 className="font-medium">{review.title}</h2>}
      {/* Plain text from the customer: rendered as text, line breaks kept (CLAUDE.md §7). */}
      {review.body === null ? null : <p className="whitespace-pre-line">{review.body}</p>}
      <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
        <span>{review.reviewer.displayName}</span>
        {options === '' ? null : <span>{options}</span>}
        <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
        {review.editedAt === null ? null : <span>{COPY.edited}</span>}
      </p>
      {review.images.length === 0 ? null : <ReviewPhotos review={review} />}
      {review.reply === null ? null : (
        <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
          <p className="font-medium">
            {COPY.yourReply}{' '}
            <time dateTime={review.reply.createdAt} className="font-normal text-muted-foreground">
              {formatDate(review.reply.createdAt)}
            </time>
          </p>
          <p className="whitespace-pre-line">{review.reply.body}</p>
        </div>
      )}
      {review.reply !== null || !review.canReply ? null : replying ? (
        <ReplyForm
          review={review}
          onDone={() => {
            setReplying(false);
          }}
        />
      ) : (
        <div className="space-y-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!access.catalog}
            aria-label={COPY.replyTo(review.reviewer.displayName)}
            aria-describedby={access.catalog || access.reason === null ? undefined : reasonId}
            onClick={() => {
              setReplying(true);
            }}
          >
            {COPY.reply}
          </Button>
          {access.catalog || access.reason === null ? null : (
            <p id={reasonId} className="text-sm text-muted-foreground">
              {access.reason}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

const replySchema = z.object({ body: fields.trimmedString(1, REPLY_MAX) });
type ReplyValues = z.input<typeof replySchema>;

const FIELD_MAP = { body: { field: 'body', message: fields.FIELD_MESSAGES.tooLong(REPLY_MAX) } } as const;

type ReviewPages = InfiniteData<{ data: SellerReview[]; meta: Schema<'PageMeta'> }>;

/** Reply once (RV-5): the answer replaces the review in every cached list. */
function ReplyForm({ review, onDone }: { readonly review: SellerReview; readonly onDone: () => void }) {
  const queryClient = useQueryClient();
  const failure = useSubmitFailure();
  const handleNotApproved = useNotApprovedHandler();
  const form = useForm<ReplyValues, unknown, z.output<typeof replySchema>>({
    resolver: zodResolver(replySchema),
    mode: 'onBlur',
    defaultValues: { body: '' },
  });
  const length = useWatch({ control: form.control, name: 'body' }).trim().length;

  const replace = (updated: SellerReview) => {
    queryClient.setQueriesData<ReviewPages>({ queryKey: reviewKeys.lists() }, (current) =>
      current === undefined
        ? current
        : {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              data: page.data.map((item) => (item.id === updated.id ? updated : item)),
            })),
          },
    );
  };

  const onSubmit = form.handleSubmit(async ({ body }) => {
    failure.clear();
    try {
      replace(await replyToReview(review.id, body));
      toast({ title: COPY.replied, tone: 'success' });
      onDone();
    } catch (error) {
      if (handleNotApproved(error)) return;
      if (
        isApiError(error, 'REVIEW_ALREADY_REPLIED') ||
        isApiError(error, 'REVIEW_HIDDEN') ||
        isApiError(error, 'REVIEW_NOT_FOUND')
      ) {
        void queryClient.invalidateQueries({ queryKey: reviewKeys.lists() });
        if (!isApiError(error, 'REVIEW_NOT_FOUND')) toast({ title: COPY.cantReply, tone: 'destructive' });
        onDone();
        return;
      }
      if (!applyServerErrors(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="max-w-xl space-y-3">
      {failure.message === null ? null : (
        <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
      )}
      <Field
        control={form.control}
        name="body"
        label={COPY.yourReply}
        description={COPY.replyNote}
        required
        render={({ field, controlProps }) => (
          <Textarea {...field} {...controlProps} rows={3} maxLength={REPLY_MAX} />
        )}
      />
      <p className="text-sm text-muted-foreground">{COPY.characters(length, REPLY_MAX)}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={form.formState.isSubmitting} disabled={failure.blocked}>
          {COPY.sendReply}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          {COPY.cancel}
        </Button>
      </div>
    </form>
  );
}
