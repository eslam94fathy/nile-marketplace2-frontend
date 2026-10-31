import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Returns' };

/** AD-32 Returns: the dashboard's "Returns to decide" links here since T-M1, built in T-M7. */
export default async function ReturnsPage() {
  await requireSession();
  return <PlaceholderScreen title="Returns" task="T-M7" />;
}
