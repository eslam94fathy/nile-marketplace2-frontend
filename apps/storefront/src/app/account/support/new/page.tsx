import type { Metadata } from 'next';
import { NEW_TICKET_COPY, NewTicketForm } from '@nile/support-screens';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: NEW_TICKET_COPY.title };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

/** SF-30 New ticket, `?category=&order=&sellerOrder=` preselect (the form drops values it can't use). */
export default async function NewTicketPage({ searchParams }: PageProps<'/account/support/new'>) {
  await requireSession();
  const params = await searchParams;
  return (
    <NewTicketForm
      initial={{
        category: first(params.category),
        orderId: first(params.order),
        sellerOrderId: first(params.sellerOrder),
      }}
    />
  );
}
