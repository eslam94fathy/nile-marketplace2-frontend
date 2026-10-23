import type { Metadata } from 'next';
import { PaymentDetail } from '@/features/payments';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Payment' };

/** AD-17 Payment. */
export default async function PaymentPage({ params }: PageProps<'/payments/[paymentId]'>) {
  const { user } = await requireSession();
  return <PaymentDetail paymentId={(await params).paymentId} currentUserId={user.id} />;
}
