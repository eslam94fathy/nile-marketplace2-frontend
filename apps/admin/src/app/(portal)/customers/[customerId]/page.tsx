import type { Metadata } from 'next';
import { CustomerDetail } from '@/features/customers';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Customer' };

/** AD-26 Customer. */
export default async function CustomerPage({ params }: PageProps<'/customers/[customerId]'>) {
  await requireSession();
  return <CustomerDetail customerId={(await params).customerId} />;
}
