import type { Metadata } from 'next';
import { NewAgent } from '@/features/agents';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'New agent' };

/** AD-10 New agent. */
export default async function NewAgentPage() {
  await requireSession();
  return <NewAgent />;
}
