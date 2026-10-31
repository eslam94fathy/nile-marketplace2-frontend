import type { Metadata } from 'next';
import { TicketDetail } from '@/features/support';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Support ticket' };

/** AD-29 Ticket (also the target of admin support notifications, spec 00 §12.5). */
export default async function SupportTicketPage({ params }: PageProps<'/support/[ticketId]'>) {
  const { user } = await requireSession();
  return <TicketDetail ticketId={(await params).ticketId} currentUserId={user.id} />;
}
