'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which account pages don't have.
import { useHydrated, useSubmitFailure } from '@nile/auth-screens';
import { fields, formatDate } from '@nile/domain';
import { MEDIA_ACCEPT, useImageUploads, type UploadTile } from '@nile/media';
import { applyServerErrors } from '@nile/query';
import {
  Button,
  buttonVariants,
  EmptyState,
  ErrorState,
  Field,
  FormAlert,
  Input,
  LoadingRegion,
  NileImage,
  PageHeader,
  RatingInput,
  Skeleton,
  StarRating,
  Textarea,
  toast,
  UI_COPY,
  UploadTiles,
  useCooldown,
  type UploadTileView,
} from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { browserApi } from '@/lib/browser-api';
import { reviewPath, ROUTES } from '@/lib/routes';
import { reviewKeys } from '../api';
import { MY_REVIEWS_COPY, REVIEW_FORM_COPY as COPY } from '../copy';
import { reviewsTabHref } from '../lib/routes';
import {
  allReviewableQuery,
  createReview,
  editReview,
  myReviewKeys,
  myReviewQuery,
  REVIEW_BODY_MAX,
  REVIEW_MAX_PHOTOS,
  REVIEW_TITLE_MAX,
  type MyReview,
  type ReviewableItem,
} from '../my-api';
import {
  createBody,
  editBody,
  EMPTY_REVIEW,
  reviewFormValues,
  reviewSchema,
  type ReviewFormValues,
  type ReviewValues,
} from '../schemas';

type ReviewField = 'rating' | 'title' | 'body';

const FIELD_MAP = {
  rating: { field: 'rating', message: COPY.ratingRequired },
  title: { field: 'title', message: fields.FIELD_MESSAGES.tooLong(REVIEW_TITLE_MAX) },
  body: { field: 'body', message: fields.FIELD_MESSAGES.tooLong(REVIEW_BODY_MAX) },
} as const;

function correlationIdOf(error: unknown): string | undefined {
  return isApiError(error) ? (error.correlationId ?? undefined) : undefined;
}

function tileView(tile: UploadTile): UploadTileView {
  return {
    key: tile.key,
    fileName: tile.fileName,
    previewUrl: tile.previewUrl,
    status: tile.status,
    progress: tile.progress,
    message: tile.message,
    canRetry: tile.canRetry,
  };
}

/** The product the review is about, above the form. */
function Subject({
  name,
  image,
  variantOptions,
}: {
  readonly name: string;
  readonly image: ReviewableItem['product']['primaryImage'];
  readonly variantOptions: ReviewableItem['variantOptions'];
}) {
  const options = variantOptions.map((option) => `${option.attribute}: ${option.value}`).join(' · ');
  return (
    <div className="flex items-center gap-4">
      <NileImage
        image={image}
        alt=""
        sizes="64px"
        placeholder="product"
        className="size-16 rounded-md bg-muted"
      />
      <div>
        <p className="font-medium">{name}</p>
        {options === '' ? null : <p className="text-sm text-muted-foreground">{options}</p>}
      </div>
    </div>
  );
}

type Target =
  | { readonly kind: 'write'; readonly item: ReviewableItem }
  | { readonly kind: 'edit'; readonly review: MyReview };

/**
 * SF-25 form: rating, title, review text (with a counter) and up to 4 photos uploaded as they are picked.
 * Submitting waits for the uploads; write sends only filled fields, edit only what changed (spec 01 SF-25).
 */
function ReviewForm({ target }: { readonly target: Target }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const failure = useSubmitFailure(COPY.errors);
  const cooldown = useCooldown();
  const original = target.kind === 'edit' ? target.review : null;
  /** Photos already on the review (edit): kept unless removed; their ids are media ids [VERIFIED]. */
  const [kept, setKept] = useState(original?.images ?? []);
  const uploads = useImageUploads({
    api: browserApi,
    purpose: 'review_image',
    max: REVIEW_MAX_PHOTOS - kept.length,
    onRateLimited: cooldown.start,
  });
  const form = useForm<ReviewFormValues, unknown, ReviewValues>({
    resolver: zodResolver(reviewSchema),
    mode: 'onBlur',
    defaultValues: original === null ? EMPTY_REVIEW : reviewFormValues(original),
  });
  const watched = useWatch({ control: form.control }) as ReviewFormValues;
  const mediaIds = [...kept.map((image) => image.id), ...uploads.readyMediaIds];
  const parsed = reviewSchema.safeParse(watched);
  // Edit: Save only with a change (an invalid value counts, so submitting shows its error).
  const changed = original === null || !parsed.success || editBody(parsed.data, original, mediaIds) !== null;

  const finish = (review: MyReview) => {
    void queryClient.invalidateQueries({ queryKey: myReviewKeys.all() });
    void queryClient.invalidateQueries({ queryKey: reviewKeys.all() });
    uploads.clear();
    if (target.kind === 'write') {
      toast({ title: COPY.published, tone: 'success' });
      router.push(reviewsTabHref('written'));
    } else {
      queryClient.setQueryData(myReviewKeys.detail(review.id), review);
      router.push(reviewPath(review.id));
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    try {
      if (target.kind === 'write') {
        finish(await createReview(createBody(values, target.item.orderItemId, mediaIds)));
        return;
      }
      const body = editBody(values, target.review, mediaIds);
      if (body !== null) finish(await editReview(target.review.id, body));
    } catch (error) {
      if (isApiError(error, 'MEDIA_NOT_ATTACHABLE')) {
        // The named uploads show "Upload this photo again."; the form stays open (conventions §12.2).
        uploads.markNotAttachable(
          error.details.flatMap((detail) => (detail.value === undefined ? [] : [detail.value])),
        );
        return;
      }
      if (!applyServerErrors<ReviewField>(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  const bodyLength = watched.body.trim().length;
  const views: UploadTileView[] = [
    ...kept.map((image, index) => ({
      key: image.id,
      fileName: UI_COPY.photoOf(index + 1, kept.length),
      previewUrl: image.urls.thumb,
      status: 'ready' as const,
      progress: 100,
      message: null,
      canRetry: false,
    })),
    ...uploads.tiles.map(tileView),
  ];

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="max-w-xl space-y-5">
      {failure.message === null ? null : (
        <FormAlert correlationId={failure.correlationId}>
          {failure.message}
          {isApiError(failure.error, 'REVIEW_ALREADY_EXISTS') ? (
            <>
              {' '}
              <Link href={reviewsTabHref('written')} className="underline">
                {COPY.seeWritten}
              </Link>
            </>
          ) : null}
        </FormAlert>
      )}
      <Controller
        control={form.control}
        name="rating"
        render={({ field, fieldState }) => (
          <RatingInput
            legend={COPY.rating}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            required
          />
        )}
      />
      <Field
        control={form.control}
        name="title"
        label={COPY.title}
        render={({ field, controlProps }) => (
          <Input {...field} {...controlProps} value={field.value} maxLength={REVIEW_TITLE_MAX} />
        )}
      />
      <Field
        control={form.control}
        name="body"
        label={COPY.body}
        description={COPY.counter(bodyLength, REVIEW_BODY_MAX)}
        render={({ field, controlProps }) => (
          <Textarea {...field} {...controlProps} value={field.value} rows={6} />
        )}
      />
      <UploadTiles
        label={COPY.photos}
        tiles={views}
        refusals={uploads.refusals}
        announcement={uploads.announcement}
        accept={MEDIA_ACCEPT}
        canAddMore={kept.length + uploads.tiles.length < REVIEW_MAX_PHOTOS}
        cooldownSeconds={cooldown.remaining}
        onAdd={uploads.add}
        onRemove={(key) => {
          if (kept.some((image) => image.id === key)) setKept(kept.filter((image) => image.id !== key));
          else uploads.remove(key);
        }}
        onRetry={uploads.retry}
      />
      <div className="space-y-2">
        <Button
          type="submit"
          loading={form.formState.isSubmitting}
          disabled={!hydrated || uploads.busy || !changed || failure.blocked}
        >
          {target.kind === 'write' ? COPY.publish : COPY.save}
        </Button>
        {uploads.busy ? <p className="text-sm text-muted-foreground">{UI_COPY.waitForUploads}</p> : null}
      </div>
    </form>
  );
}

function BackToReviews() {
  return (
    <Link href={ROUTES.reviews} className={buttonVariants({ variant: 'outline' })}>
      {COPY.backToReviews}
    </Link>
  );
}

function Loading({ title }: { readonly title: string }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} />
      <LoadingRegion>
        <Skeleton className="h-80 max-w-xl" />
      </LoadingRegion>
    </div>
  );
}

/** SF-25 write: the item must be in `GET /me/reviewable-items` (spec 01 SF-25). */
export function WriteReview({ orderItemId }: { readonly orderItemId: string | null }) {
  const items = useQuery({ ...allReviewableQuery(), enabled: orderItemId !== null });
  if (orderItemId !== null && items.isPending) return <Loading title={COPY.writeTitle} />;
  if (items.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.writeTitle} />
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void items.refetch()}
          retrying={items.isFetching}
          correlationId={correlationIdOf(items.error)}
        />
      </div>
    );
  }
  const item = items.data?.find((candidate) => candidate.orderItemId === orderItemId);
  if (item === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.writeTitle} />
        <EmptyState title={COPY.cannotReview} action={<BackToReviews />} />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader title={COPY.writeTitle} />
      <Subject
        name={item.product.name}
        image={item.product.primaryImage}
        variantOptions={item.variantOptions}
      />
      <ReviewForm target={{ kind: 'write', item }} />
    </div>
  );
}

/** SF-25 edit: `GET /me/reviews/{id}`; read-only once the 30-day edit window has passed. */
export function EditReview({ reviewId }: { readonly reviewId: string }) {
  const review = useQuery(myReviewQuery(reviewId));
  if (review.isPending) return <Loading title={COPY.editTitle} />;
  if (review.isError) {
    const gone = isApiError(review.error, 'REVIEW_NOT_FOUND', 'VALIDATION_FAILED');
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.editTitle} />
        {gone ? (
          <EmptyState title={MY_REVIEWS_COPY.gone} action={<BackToReviews />} />
        ) : (
          <ErrorState
            message={COPY.loadFailed}
            onRetry={() => void review.refetch()}
            retrying={review.isFetching}
            correlationId={correlationIdOf(review.error)}
          />
        )}
      </div>
    );
  }
  const data = review.data;
  return (
    <div className="space-y-6">
      <PageHeader title={COPY.editTitle} />
      <Subject
        name={data.product.name}
        image={data.product.primaryImage}
        variantOptions={data.variantOptions}
      />
      {data.canEdit ? (
        <ReviewForm target={{ kind: 'edit', review: data }} />
      ) : (
        <div className="max-w-xl space-y-3">
          <p role="status" className="rounded-md bg-muted p-3 text-sm">
            {COPY.editClosed}
          </p>
          <StarRating rating={data.rating} />
          {data.title === null ? null : <p className="font-medium">{data.title}</p>}
          {data.body === null ? null : <p className="whitespace-pre-line">{data.body}</p>}
          <p className="text-sm text-muted-foreground">
            <time dateTime={data.createdAt}>{formatDate(data.createdAt)}</time>
          </p>
          <BackToReviews />
        </div>
      )}
    </div>
  );
}
