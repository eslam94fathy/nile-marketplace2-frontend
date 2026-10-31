import type { Metadata } from 'next';
import { parseSupportTab, TICKET_LIST_COPY, TicketList } from '@nile/support-screens';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: TICKET_LIST_COPY.title };

/** SF-29 Support tickets, `?status=open|closed`. */
export default async function SupportPage({ searchParams }: PageProps<'/account/support'>) {
  await requireSession();
  const status = (await searchParams).status;
  return <TicketList tab={parseSupportTab(Array.isArray(status) ? status[0] : status)} />;
}
