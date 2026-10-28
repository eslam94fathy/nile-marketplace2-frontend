import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Return' };

/** SF-28 Return: a notification link target since T-J6 (spec 00 §12.5), built in T-K6. */
export default async function ReturnPage() {
  await requireSession();
  return <PlaceholderScreen title="Return" task="T-K6" />;
}
