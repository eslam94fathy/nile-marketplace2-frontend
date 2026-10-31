import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Reviews' };

/** AD-30 Reviews: AD-26 "Reviews" links here since T-M2, built in T-M6. */
export default async function ReviewsPage() {
  await requireSession();
  return <PlaceholderScreen title="Reviews" task="T-M6" />;
}
