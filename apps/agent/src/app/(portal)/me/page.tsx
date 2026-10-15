import type { Metadata } from 'next';
import Link from 'next/link';
import { PlaceholderScreen } from '@nile/ui';
import { SignOutButton } from '@/components/session/sign-out-button';
import { requireSession } from '@/lib/dal';
import { ROUTES } from '@/lib/routes';

export const metadata: Metadata = { title: 'Me' };

const SECURITY = 'Security';

/** AG-02 arrives with T-H12; its links (Security, Sign out; spec 04) are available already. */
export default async function MePage() {
  await requireSession();
  return (
    <div className="space-y-6">
      <PlaceholderScreen title="Me" task="T-H12" />
      <div className="flex flex-wrap items-center gap-4">
        <Link href={ROUTES.security} className="font-medium text-primary underline-offset-4 hover:underline">
          {SECURITY}
        </Link>
        <SignOutButton />
      </div>
    </div>
  );
}
