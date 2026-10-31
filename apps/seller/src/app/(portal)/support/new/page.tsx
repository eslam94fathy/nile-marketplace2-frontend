import type { Metadata } from 'next';
import { NEW_TICKET_COPY } from '@nile/support-screens';
import { NewSellerTicket } from '@/features/support';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: NEW_TICKET_COPY.title };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

/** SE-25 New ticket, `?category=&sellerOrder=&product=` preselect (the form drops values it can't use). */
export default async function NewTicketPage({ searchParams }: PageProps<'/support/new'>) {
  await requireSession();
  const params = await searchParams;
  return (
    <NewSellerTicket
      category={first(params.category)}
      sellerOrderId={first(params.sellerOrder)}
      productId={first(params.product)}
    />
  );
}
