import type { Metadata } from 'next';
import { ProfileView } from '@/features/profile';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  await requireSession();
  return <ProfileView />;
}
