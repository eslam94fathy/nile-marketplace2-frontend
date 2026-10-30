import type { Metadata } from 'next';
import { REVIEW_FORM_COPY, REVIEWS_PARAMS, WriteReview } from '@/features/reviews';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: REVIEW_FORM_COPY.writeTitle };

/** SF-25 Write a review, for `?item=<orderItemId>`. */
export default async function WriteReviewPage({ searchParams }: PageProps<'/account/reviews/write'>) {
  await requireSession();
  const item = (await searchParams)[REVIEWS_PARAMS.item];
  return <WriteReview orderItemId={(Array.isArray(item) ? item[0] : item) ?? null} />;
}
