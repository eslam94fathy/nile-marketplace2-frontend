import { fields } from '@nile/domain';
import * as z from 'zod';
import {
  REVIEW_BODY_MAX,
  REVIEW_TITLE_MAX,
  type CreateReviewBody,
  type EditReviewBody,
  type MyReview,
} from './my-api';
import { REVIEW_FORM_COPY } from './copy';

// SF-25 review form, mirroring `CreateReviewDto` / `EditReviewDto`: rating 1..5 required; title and body
// optional, trimmed, 1..120 and 1..2000 (an empty field is no title / no body).

export const reviewSchema = z.object({
  // `null` until the shopper chooses; required (conventions §12.8).
  rating: z
    .number()
    .nullable()
    .refine((value) => value !== null, REVIEW_FORM_COPY.ratingRequired)
    .pipe(z.number().int().min(1, REVIEW_FORM_COPY.ratingRequired).max(5, REVIEW_FORM_COPY.ratingRequired)),
  title: fields.nullableTrimmedString(1, REVIEW_TITLE_MAX),
  body: fields.nullableTrimmedString(1, REVIEW_BODY_MAX),
});

/** The form's values: the rating is `null` until chosen. */
export type ReviewFormValues = z.input<typeof reviewSchema>;
export type ReviewValues = z.output<typeof reviewSchema>;

export const EMPTY_REVIEW: ReviewFormValues = { rating: null, title: '', body: '' };

export function reviewFormValues(review: MyReview): ReviewFormValues {
  return { rating: review.rating, title: review.title ?? '', body: review.body ?? '' };
}

/** `POST /reviews`: empty optional fields are left out (spec 01 SF-25). */
export function createBody(
  values: ReviewValues,
  orderItemId: string,
  imageMediaIds: readonly string[],
): CreateReviewBody {
  return {
    orderItemId,
    rating: values.rating,
    ...(values.title === null ? {} : { title: values.title }),
    ...(values.body === null ? {} : { body: values.body }),
    ...(imageMediaIds.length === 0 ? {} : { imageMediaIds: [...imageMediaIds] }),
  };
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * `PATCH /me/reviews/{id}`: only what changed; a cleared title or body is `null`; the photos are sent whole when
 * they changed (spec 01 SF-25). Null when nothing changed (the API refuses an empty body).
 */
export function editBody(
  values: ReviewValues,
  review: MyReview,
  imageMediaIds: readonly string[],
): EditReviewBody | null {
  const body: EditReviewBody = {
    ...(values.rating === review.rating ? {} : { rating: values.rating }),
    ...(values.title === review.title ? {} : { title: values.title }),
    ...(values.body === review.body ? {} : { body: values.body }),
    ...(sameIds(
      imageMediaIds,
      review.images.map((image) => image.id),
    )
      ? {}
      : { imageMediaIds: [...imageMediaIds] }),
  };
  return Object.keys(body).length === 0 ? null : body;
}
