import type { Metadata } from 'next';
import { CART_COPY, CartView } from '@/features/cart';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: CART_COPY.title };

/** SF-06 Cart: shell rendered on the server, the cart itself fetched on the client (never cached). */
export default async function CartPage() {
  await requireSession();
  return <CartView />;
}
