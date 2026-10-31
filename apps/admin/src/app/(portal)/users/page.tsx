import type { Metadata } from 'next';
import { UsersList } from '@/features/users';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Users' };

/** AD-24 Users: filters come from the URL; the signed-in admin's id hides actions on their own row. */
export default async function UsersPage({ searchParams }: PageProps<'/users'>) {
  const { user } = await requireSession();
  return <UsersList params={await searchParams} currentUserId={user.id} />;
}
