import type { Metadata } from 'next';
import { AuditLog } from '@/features/audit';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Audit log' };

/** AD-38 Audit log: filters from the URL (also from the "History" links); the admin's id lets the actor say "You". */
export default async function AuditPage({ searchParams }: PageProps<'/audit'>) {
  const { user } = await requireSession();
  return <AuditLog params={await searchParams} currentUserId={user.id} />;
}
