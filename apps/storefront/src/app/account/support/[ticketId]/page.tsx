import type { Metadata } from 'next';
import { TicketThread } from '@nile/support-screens';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Support ticket' };

/** SF-31 Ticket thread. */
export default async function SupportTicketPage({ params }: PageProps<'/account/support/[ticketId]'>) {
  await requireSession();
  const { ticketId } = await params;
  return <TicketThread ticketId={ticketId} />;
}
