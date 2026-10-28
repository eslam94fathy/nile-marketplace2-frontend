import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Your reviews' };

/** SF-24 My reviews: a notification link target since T-J6 (spec 00 §12.5), built in T-K5. */
export default async function YourReviewsPage() {
  await requireSession();
  return <PlaceholderScreen title="Your reviews" task="T-K5" />;
}
