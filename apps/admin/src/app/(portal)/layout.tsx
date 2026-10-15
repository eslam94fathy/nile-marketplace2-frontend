import type { ReactNode } from 'react';
import { AdminShell } from '@/components/shell/admin-shell';
import { readSession } from '@/lib/dal';

// Signed-in area of the app; the sign-in screens live outside this group, without the shell. Each page still
// calls requireSession() itself (layouts don't re-run on client navigation); this only reads the email.
export default async function PortalLayout({ children }: { readonly children: ReactNode }) {
  const session = await readSession();
  return <AdminShell email={session?.user.email ?? null}>{children}</AdminShell>;
}
