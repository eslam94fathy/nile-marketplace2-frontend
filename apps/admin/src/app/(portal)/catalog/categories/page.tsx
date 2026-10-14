import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Categories' };

export default async function CategoriesPage() {
  await requireSession();
  return <PlaceholderScreen title="Categories" task="T-H8" />;
}
