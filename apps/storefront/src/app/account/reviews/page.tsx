import type { Metadata } from 'next';
import { MY_REVIEWS_COPY, MyReviews, parseReviewsTab, REVIEWS_PARAMS } from '@/features/reviews';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: MY_REVIEWS_COPY.title };

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/** SF-24 My reviews: tabs in the URL (`?tab=`), `?review=<id>` highlights one (spec 01 §10). */
export default async function YourReviewsPage({ searchParams }: PageProps<'/account/reviews'>) {
  await requireSession();
  const params = await searchParams;
  return (
    <MyReviews
      tab={parseReviewsTab(first(params[REVIEWS_PARAMS.tab]))}
      highlight={first(params[REVIEWS_PARAMS.review])}
    />
  );
}
