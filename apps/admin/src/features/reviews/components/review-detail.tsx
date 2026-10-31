'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields, formatDateTime, REVIEW_STATUS_LABELS } from '@nile/domain';
import { errorMessage } from '@nile/query';
import {
  Badge,
  Button,
  buttonVariants,
  ConfirmDialog,
  ErrorState,
  Field,
  FormAlert,
  Lightbox,
  NileImage,
  NotFoundScreen,
  PageHeader,
  REVIEW_STATUS_TONES,
  Skeleton,
  StarRating,
  StatusBadge,
  Textarea,
  toast,
  UI_COPY,
  type LightboxImage,
} from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useSellerNames } from '@/features/lookups';
import { useProductNames } from '@/features/products';
import { customerPath, productPath, ROUTES, sellerPath } from '@/lib/routes';
import {
  hideReply,
  hideReview,
  isReviewMissing,
  reviewKeys,
  reviewQuery,
  unhideReply,
  unhideReview,
  type AdminReview,
} from '../api';
import { REVIEWS_COPY as COPY } from '../copy';

const LINK = 'text-primary underline-offset-4 hover:underline';

type Action = 'hide-review' | 'show-review' | 'hide-reply' | 'show-reply';

/** AD-31 Review: the whole review, the seller's reply, and hide / show for each (spec 03 §7.6). */
export function ReviewDetail({ reviewId }: { readonly reviewId: string }) {
  const review = useQuery(reviewQuery(reviewId));
  if (review.isError) {
    if (isReviewMissing(review.error)) {
      return (
        <NotFoundScreen
          message={COPY.notFound}
          homeLink={
            <Link href={ROUTES.reviews} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToReviews}
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.reviewTitle} />
        <ErrorState
          message={COPY.reviewLoadFailed}
          onRetry={() => void review.refetch()}
          correlationId={isApiError(review.error) ? (review.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (review.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 max-w-2xl" />
      </div>
    );
  }
  return <ReviewContent review={review.data} />;
}

function ReviewContent({ review }: { readonly review: AdminReview }) {
  const [action, setAction] = useState<Action | null>(null);
  const productName = useProductNames([review.productId]);
  const sellerName = useSellerNames([review.sellerId]);
  const options = review.variantOptions.map((option) => `${option.attribute}: ${option.value}`).join(' · ');
  const reply = review.reply;
  const close = () => {
    setAction(null);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={review.title ?? COPY.reviewTitle}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <StatusBadge
              value={review.status}
              labels={REVIEW_STATUS_LABELS.admin}
              tones={REVIEW_STATUS_TONES}
            />
            <StarRating rating={review.rating} />
          </span>
        }
      />
      <div role="group" aria-label={COPY.actionsLabel} className="flex flex-wrap gap-2">
        {review.status === 'published' ? (
          <Button
            variant="destructive"
            onClick={() => {
              setAction('hide-review');
            }}
          >
            {COPY.hideReview}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setAction('show-review');
            }}
          >
            {COPY.showReview}
          </Button>
        )}
      </div>
      {/* Plain text from the customer: rendered as text, line breaks kept (CLAUDE.md §7). */}
      {review.body === null ? null : <p className="max-w-2xl whitespace-pre-line">{review.body}</p>}
      {review.images.length === 0 ? null : <ReviewPhotos review={review} />}
      <dl aria-label={COPY.detailsLabel} className="max-w-2xl space-y-2 text-sm">
        <Row label={COPY.product}>
          <Link href={productPath(review.productId)} className={LINK}>
            {productName(review.productId) ?? COPY.shortId(review.productId)}
          </Link>
        </Row>
        <Row label={COPY.variant}>{options === '' ? COPY.none : options}</Row>
        <Row label={COPY.seller}>
          <Link href={sellerPath(review.sellerId)} className={LINK}>
            {sellerName(review.sellerId) ?? COPY.shortId(review.sellerId)}
          </Link>
        </Row>
        <Row label={COPY.customer}>
          <Link href={customerPath(review.customerId)} className={LINK}>
            {COPY.shortId(review.customerId)}
          </Link>
        </Row>
        <Row label={COPY.reviewer}>{review.reviewer.displayName}</Row>
        <Row label={COPY.orderItem}>{review.orderItemId}</Row>
        <Row label={COPY.written}>{formatDateTime(review.createdAt)}</Row>
        {review.editedAt === null ? null : <Row label={COPY.edited}>{formatDateTime(review.editedAt)}</Row>}
        {review.hiddenAt === null ? null : <Row label={COPY.hiddenAt}>{formatDateTime(review.hiddenAt)}</Row>}
        {review.hiddenReason === null ? null : <Row label={COPY.hiddenReason}>{review.hiddenReason}</Row>}
      </dl>
      <section aria-labelledby="review-reply-heading" className="max-w-2xl space-y-3">
        <h2 id="review-reply-heading" className="text-lg font-semibold">
          {COPY.replyHeading}
        </h2>
        {reply === null ? (
          <p className="text-sm text-muted-foreground">{COPY.noReply}</p>
        ) : (
          <>
            <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
              <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <time dateTime={reply.createdAt}>{formatDateTime(reply.createdAt)}</time>
                {reply.hiddenAt === null ? null : <Badge tone="neutral">{COPY.replyHidden}</Badge>}
              </p>
              <p className="whitespace-pre-line">{reply.body}</p>
            </div>
            {reply.hiddenAt === null ? null : (
              <dl className="space-y-2 text-sm">
                <Row label={COPY.hiddenAt}>{formatDateTime(reply.hiddenAt)}</Row>
                {reply.hiddenReason === null ? null : (
                  <Row label={COPY.hiddenReason}>{reply.hiddenReason}</Row>
                )}
              </dl>
            )}
            <div role="group" aria-label={COPY.replyActionsLabel} className="flex flex-wrap gap-2">
              {reply.hiddenAt === null ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setAction('hide-reply');
                  }}
                >
                  {COPY.hideReply}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setAction('show-reply');
                  }}
                >
                  {COPY.showReply}
                </Button>
              )}
            </div>
          </>
        )}
      </section>
      {action === 'hide-review' ? (
        <HideDialog
          review={review}
          title={COPY.hideReview}
          description={COPY.hideReviewNote}
          hide={hideReview}
          doneToast={COPY.reviewHidden}
          onClose={close}
        />
      ) : null}
      {action === 'hide-reply' ? (
        <HideDialog
          review={review}
          title={COPY.hideReply}
          description={COPY.hideReplyNote}
          hide={hideReply}
          doneToast={COPY.replyHiddenToast}
          onClose={close}
        />
      ) : null}
      {action === 'show-review' ? (
        <ShowDialog
          review={review}
          title={COPY.showReview}
          description={COPY.showReviewNote}
          show={unhideReview}
          doneToast={COPY.reviewShown}
          onClose={close}
        />
      ) : null}
      {action === 'show-reply' ? (
        <ShowDialog
          review={review}
          title={COPY.showReply}
          description={COPY.showReplyNote}
          show={unhideReply}
          doneToast={COPY.replyShown}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

function ReviewPhotos({ review }: { readonly review: AdminReview }) {
  const [index, setIndex] = useState<number | null>(null);
  const label = COPY.photosLabel(review.reviewer.displayName);
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
              className="block size-20 overflow-hidden rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={() => {
                setIndex(position);
              }}
            >
              <NileImage image={photo} alt="" sizes="80px" placeholder="product" className="size-full" />
            </button>
          </li>
        ))}
      </ul>
      <Lightbox images={photos} index={index} onIndexChange={setIndex} title={label} />
    </>
  );
}

/** Puts the answer in the cache, or reads the review again when it changed meanwhile. */
function useReviewWrite(review: AdminReview) {
  const queryClient = useQueryClient();
  const key = reviewKeys.detail(review.id);
  return {
    done: (updated: AdminReview) => {
      queryClient.setQueryData(key, updated);
      void queryClient.invalidateQueries({ queryKey: reviewKeys.lists() });
    },
    /** `REVIEW_INVALID_STATUS_TRANSITION` / `REVIEW_REPLY_NOT_FOUND`: refetch and explain (spec 03 AD-31). */
    stale: (error: unknown): boolean => {
      if (
        !isApiError(error, 'REVIEW_INVALID_STATUS_TRANSITION') &&
        !isApiError(error, 'REVIEW_REPLY_NOT_FOUND')
      ) {
        return false;
      }
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.lists() });
      toast({ title: COPY.changed, tone: 'destructive' });
      return true;
    },
  };
}

const hideSchema = z.object({ reason: fields.trimmedString(3, 500) });
type HideValues = z.input<typeof hideSchema>;

function HideDialog({
  review,
  title,
  description,
  hide,
  doneToast,
  onClose,
}: {
  readonly review: AdminReview;
  readonly title: string;
  readonly description: string;
  readonly hide: (reviewId: string, reason: string) => Promise<AdminReview>;
  readonly doneToast: string;
  readonly onClose: () => void;
}) {
  const write = useReviewWrite(review);
  const failure = useSubmitFailure();
  const form = useForm<HideValues, unknown, z.output<typeof hideSchema>>({
    resolver: zodResolver(hideSchema),
    mode: 'onBlur',
    defaultValues: { reason: '' },
  });

  const confirm = async () => {
    failure.clear();
    let reason: string | undefined;
    await form.handleSubmit((values) => {
      reason = values.reason;
    })();
    if (reason === undefined) throw new Error('invalid');
    try {
      write.done(await hide(review.id, reason));
      toast({ title: doneToast });
    } catch (error) {
      if (write.stale(error)) return;
      failure.fail(error);
      throw error;
    }
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={description}
      confirmLabel={title}
      destructive
      onConfirm={confirm}
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          // Enter in the reason must not submit: the dialog's button confirms.
          event.preventDefault();
        }}
      >
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <Field
          control={form.control}
          name="reason"
          label={COPY.reason}
          required
          render={({ field, controlProps }) => <Textarea {...field} {...controlProps} rows={3} />}
        />
      </form>
    </ConfirmDialog>
  );
}

function ShowDialog({
  review,
  title,
  description,
  show,
  doneToast,
  onClose,
}: {
  readonly review: AdminReview;
  readonly title: string;
  readonly description: string;
  readonly show: (reviewId: string) => Promise<AdminReview>;
  readonly doneToast: string;
  readonly onClose: () => void;
}) {
  const write = useReviewWrite(review);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={description}
      confirmLabel={title}
      onConfirm={async () => {
        try {
          write.done(await show(review.id));
          toast({ title: doneToast, tone: 'success' });
        } catch (error) {
          if (!write.stale(error)) toast({ title: errorMessage(error), tone: 'destructive' });
        }
      }}
    />
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
