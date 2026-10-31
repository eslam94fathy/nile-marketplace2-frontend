import type { Metadata } from 'next';
import { RETURNS_COPY, ReturnDetail } from '@/features/returns';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: RETURNS_COPY.detailTitle };

/** SF-28 Return detail: shell on the server, the return fetched on the client. */
export default async function ReturnPage({ params }: PageProps<'/account/returns/[returnId]'>) {
  await requireSession();
  return <ReturnDetail returnId={(await params).returnId} />;
}
