import type { Metadata } from 'next';
import { RETURN_TAB_PARAM, ReturnsList } from '@/features/returns';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Returns' };

/** SE-18 Returns: the tab comes from `?tab=`; the list is fetched on the client. */
export default async function ReturnsPage({ searchParams }: PageProps<'/returns'>) {
  await requireSession();
  const tab = (await searchParams)[RETURN_TAB_PARAM];
  return <ReturnsList tab={typeof tab === 'string' ? tab : null} />;
}
