import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Admins' };

export default async function AdminsPage() {
  await requireSession();
  return <PlaceholderScreen title="Admins" task="T-H6" />;
}
