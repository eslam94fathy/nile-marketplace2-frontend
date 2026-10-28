import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Reviews' };

/** SE-20 Reviews: a notification link target since T-J6 (spec 00 §12.5), built in T-L4. */
export default async function ReviewsPage() {
  await requireSession();
  return <PlaceholderScreen title="Reviews" task="T-L4" />;
}
