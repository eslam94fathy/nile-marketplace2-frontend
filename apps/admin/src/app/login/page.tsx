import { MAIN_CONTENT_ID, PlaceholderScreen } from '@nile/ui';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign in' };

// Outside the (portal) shell: sign-in has no navigation. Its own <main>, like not-found.tsx.
export default function SignInPage() {
  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto max-w-md p-4 outline-none">
      <PlaceholderScreen title="Sign in" task="T-D6" />
    </main>
  );
}
