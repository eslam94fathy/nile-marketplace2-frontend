import type { Metadata } from 'next';
import { AgentsList } from '@/features/agents';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Agents' };

/** AD-09 Agents: filters come from the URL; the list is fetched on the client. */
export default async function AgentsPage({ searchParams }: PageProps<'/delivery/agents'>) {
  await requireSession();
  return <AgentsList params={await searchParams} />;
}
