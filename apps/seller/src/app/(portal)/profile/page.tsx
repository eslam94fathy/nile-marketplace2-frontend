import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  await requireSession();
  return <PlaceholderScreen title="Profile" task="T-H1" />;
}
