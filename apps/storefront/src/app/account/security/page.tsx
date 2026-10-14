import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Security' };

export default async function SecurityPage() {
  await requireSession();
  return <PlaceholderScreen title="Security" task="T-D7" />;
}
