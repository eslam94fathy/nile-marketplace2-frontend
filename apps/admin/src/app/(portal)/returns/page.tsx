import type { Metadata } from 'next';
import { ReturnsList } from '@/features/returns';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Returns' };

/** AD-32 Returns: tabs and filters from the URL; also reached filtered from AD-05 and AD-26. */
export default async function ReturnsPage({ searchParams }: PageProps<'/returns'>) {
  await requireSession();
  return <ReturnsList params={await searchParams} />;
}
