import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Your account' };

export default async function AccountPage() {
  await requireSession();
  return <PlaceholderScreen title="Your account" task="T-G1" />;
}
