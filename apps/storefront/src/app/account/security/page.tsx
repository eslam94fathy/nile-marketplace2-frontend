import { AUTH_COPY } from '@nile/auth-screens';
import type { Metadata } from 'next';
import { Security } from '@/features/security';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: AUTH_COPY.security.title };

/** spec 01 SF-19. */
export default async function SecurityPage() {
  await requireSession();
  return <Security />;
}
