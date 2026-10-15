import type { Metadata } from 'next';
import { CHECKOUT_COPY, PaymentReturn } from '@/features/checkout';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: CHECKOUT_COPY.kashier.returnTitle };

/**
 * SF-09 Kashier payment return (the backend's `KASHIER_REDIRECT_URL`). Kashier's query parameters are not
 * read: the outcome comes only from the API.
 */
export default async function PaymentReturnPage() {
  await requireSession();
  return <PaymentReturn />;
}
