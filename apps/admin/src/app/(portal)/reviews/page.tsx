import type { Metadata } from 'next';
import { ReviewsList } from '@/features/reviews';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Reviews' };

/** AD-30 Reviews: also reached filtered from AD-05, AD-26 and AD-27. */
export default async function ReviewsPage({ searchParams }: PageProps<'/reviews'>) {
  await requireSession();
  return <ReviewsList params={await searchParams} />;
}
