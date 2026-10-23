import type { Metadata } from 'next';
import { CHECKOUT_COPY, CheckoutView } from '@/features/checkout';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: CHECKOUT_COPY.title };

/** SF-07 Checkout: shell on the server; cart, addresses and governorates fetched fresh on the client. */
export default async function CheckoutPage() {
  await requireSession();
  return <CheckoutView />;
}
