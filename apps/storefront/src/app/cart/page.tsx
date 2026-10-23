import type { Metadata } from 'next';
import { CART_COPY, CART_NOTICES, CartView, type CartNotice } from '@/features/cart';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: CART_COPY.title };

const NOTICE_VALUES: readonly string[] = Object.values(CART_NOTICES);

/** SF-06 Cart: shell rendered on the server, the cart itself fetched on the client (never cached). */
export default async function CartPage({ searchParams }: PageProps<'/cart'>) {
  await requireSession();
  const notice = (await searchParams).notice;
  return (
    <CartView
      notice={typeof notice === 'string' && NOTICE_VALUES.includes(notice) ? (notice as CartNotice) : null}
    />
  );
}
