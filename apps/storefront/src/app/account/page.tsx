import type { Metadata } from 'next';
import { PROFILE_COPY, ProfileView } from '@/features/account';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: PROFILE_COPY.title };

/** SF-15 Profile: shell on the server, the profile fetched on the client. */
export default async function AccountPage() {
  await requireSession();
  return <ProfileView />;
}
