import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Me' };

export default async function MePage() {
  await requireSession();
  return <PlaceholderScreen title="Me" task="T-H12" />;
}
