import type { Metadata } from 'next';
import { TicketThread } from '@nile/support-screens';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Support ticket' };

/** SE-26 Ticket thread (admins shown as "Nile Support"). */
export default async function SupportTicketPage({ params }: PageProps<'/support/[ticketId]'>) {
  await requireSession();
  const { ticketId } = await params;
  return <TicketThread ticketId={ticketId} />;
}
