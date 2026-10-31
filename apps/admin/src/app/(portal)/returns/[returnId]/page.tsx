import type { Metadata } from 'next';
import { ReturnDetail } from '@/features/returns';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Return' };

/** AD-33 Return: the signed-in admin's id lets the history say "you". */
export default async function ReturnPage({ params }: PageProps<'/returns/[returnId]'>) {
  const { user } = await requireSession();
  return <ReturnDetail returnId={(await params).returnId} currentUserId={user.id} />;
}
