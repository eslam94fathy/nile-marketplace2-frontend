import type { Metadata } from 'next';
import { CustomersList } from '@/features/customers';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Customers' };

/** AD-25 Customers: filters come from the URL; the list is fetched on the client. */
export default async function CustomersPage({ searchParams }: PageProps<'/customers'>) {
  await requireSession();
  return <CustomersList params={await searchParams} />;
}
