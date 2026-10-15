import type { Metadata } from 'next';
import { ADMIN_STATUS_PARAM, AdminsView } from '@/features/admins';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Admins' };

/** AD-03 Admins: the signed-in admin's id hides "Suspend" on their own row (the API refuses it too). */
export default async function AdminsPage({ searchParams }: PageProps<'/admins'>) {
  const { user } = await requireSession();
  const status = (await searchParams)[ADMIN_STATUS_PARAM];
  return <AdminsView status={typeof status === 'string' ? status : null} currentUserId={user.id} />;
}
