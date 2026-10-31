import type { Metadata } from 'next';
import { EditReview, REVIEW_FORM_COPY } from '@/features/reviews';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: REVIEW_FORM_COPY.editTitle };

/** SF-25 Edit a review. */
export default async function EditReviewPage({ params }: PageProps<'/account/reviews/[reviewId]/edit'>) {
  await requireSession();
  return <EditReview reviewId={(await params).reviewId} />;
}
