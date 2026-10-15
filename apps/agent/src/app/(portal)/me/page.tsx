import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { SignOutButton } from '@/components/session/sign-out-button';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Me' };

/** AG-02 arrives with T-H12; Sign out (one of its links, spec 04) is available already. */
export default async function MePage() {
  await requireSession();
  return (
    <div className="space-y-6">
      <PlaceholderScreen title="Me" task="T-H12" />
      <SignOutButton />
    </div>
  );
}
