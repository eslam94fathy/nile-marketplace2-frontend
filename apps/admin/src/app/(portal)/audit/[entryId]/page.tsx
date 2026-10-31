import type { Metadata } from 'next';
import { AuditEntryDetail } from '@/features/audit';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Audit entry' };

/** AD-39 Audit entry. */
export default async function AuditEntryPage({ params }: PageProps<'/audit/[entryId]'>) {
  const { user } = await requireSession();
  return <AuditEntryDetail entryId={(await params).entryId} currentUserId={user.id} />;
}
