import type { Metadata } from 'next';
import { ReturnDetail } from '@/features/returns';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Return' };

/** SE-19 Return: fetched on the client (another seller's return is "not found"). */
export default async function ReturnPage({ params }: PageProps<'/returns/[returnId]'>) {
  await requireSession();
  return <ReturnDetail returnId={(await params).returnId} />;
}
