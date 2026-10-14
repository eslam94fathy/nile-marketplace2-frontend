import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Reference lookup' };

export default async function ReferenceLookupPage() {
  await requireSession();
  return <PlaceholderScreen title="Reference lookup" task="T-H11" />;
}
