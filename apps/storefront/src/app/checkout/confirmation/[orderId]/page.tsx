import type { Metadata } from 'next';
import { CHECKOUT_COPY, OrderConfirmation } from '@/features/checkout';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: CHECKOUT_COPY.confirmation.title };

/** SF-08 Order confirmation: shell on the server, the order fetched on the client. */
export default async function OrderConfirmationPage({
  params,
}: PageProps<'/checkout/confirmation/[orderId]'>) {
  await requireSession();
  return <OrderConfirmation orderId={(await params).orderId} />;
}
