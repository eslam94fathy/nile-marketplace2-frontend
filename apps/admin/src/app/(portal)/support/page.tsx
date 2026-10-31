import type { Metadata } from 'next';
import { TicketsList } from '@/features/support';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Tickets' };

/** AD-28 Tickets: views and filters come from the URL; the signed-in admin's id serves the "Mine" view. */
export default async function SupportPage({ searchParams }: PageProps<'/support'>) {
  const { user } = await requireSession();
  return <TicketsList params={await searchParams} currentUserId={user.id} />;
}
