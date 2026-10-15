import type { Metadata } from 'next';
import { SellersList } from '@/features/sellers';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Sellers' };

/** AD-04 Sellers: filters come from the URL; the list is fetched on the client. */
export default async function SellersPage({ searchParams }: PageProps<'/sellers'>) {
  await requireSession();
  return <SellersList params={await searchParams} />;
}
