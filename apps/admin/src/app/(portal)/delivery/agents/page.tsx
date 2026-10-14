import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Agents' };

export default async function AgentsPage() {
  await requireSession();
  return <PlaceholderScreen title="Agents" task="T-H9" />;
}
