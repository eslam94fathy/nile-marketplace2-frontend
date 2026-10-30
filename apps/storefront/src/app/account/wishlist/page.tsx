import type { Metadata } from 'next';
import { WISHLIST_COPY, WishlistView } from '@/features/wishlist';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: WISHLIST_COPY.title };

/** SF-23 Wishlist: shell on the server, the list on the client. */
export default async function WishlistPage() {
  await requireSession();
  return <WishlistView />;
}
