import type { Metadata } from 'next';
import { ReviewDetail } from '@/features/reviews';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Review' };

/** AD-31 Review. */
export default async function ReviewPage({ params }: PageProps<'/reviews/[reviewId]'>) {
  await requireSession();
  return <ReviewDetail reviewId={(await params).reviewId} />;
}
