import type { Metadata } from 'next';
import { ReferenceLookup } from '@/features/finance';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Reference lookup' };

/** AD-22 Reference lookup: the reference comes from the URL. */
export default async function ReferenceLookupPage({ searchParams }: PageProps<'/finance/lookup'>) {
  await requireSession();
  return <ReferenceLookup params={await searchParams} />;
}
