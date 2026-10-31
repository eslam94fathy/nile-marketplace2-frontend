import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Return' };

/** AD-33 Return: a dashboard link target since T-M1, built in T-M7. */
export default async function ReturnPage() {
  await requireSession();
  return <PlaceholderScreen title="Return" task="T-M7" />;
}
