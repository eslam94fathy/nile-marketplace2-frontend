import type { Metadata } from 'next';
import { AgentDetail } from '@/features/agents';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Agent' };

/** AD-11 Agent. */
export default async function AgentPage({ params }: PageProps<'/delivery/agents/[agentId]'>) {
  await requireSession();
  return <AgentDetail agentId={(await params).agentId} />;
}
