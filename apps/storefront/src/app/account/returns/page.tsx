import type { Metadata } from 'next';
import { parseReturnsTab, RETURNS_COPY, ReturnsList } from '@/features/returns';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: RETURNS_COPY.title };

/** SF-27 Returns, `?status=open|closed`. */
export default async function ReturnsPage({ searchParams }: PageProps<'/account/returns'>) {
  await requireSession();
  const status = (await searchParams).status;
  return <ReturnsList tab={parseReturnsTab((Array.isArray(status) ? status[0] : status) ?? null)} />;
}
