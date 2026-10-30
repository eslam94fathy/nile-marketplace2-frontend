import type { Metadata } from 'next';
import { ReviewsList } from '@/features/reviews';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Reviews' };

/** SE-20 Reviews: filters come from the URL; the list is fetched on the client. */
export default async function ReviewsPage({ searchParams }: PageProps<'/reviews'>) {
  await requireSession();
  return <ReviewsList params={await searchParams} />;
}
