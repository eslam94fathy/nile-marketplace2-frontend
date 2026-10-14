import type { ReactNode } from 'react';
import { AdminShell } from '@/components/shell/admin-shell';

// Signed-in area of the app. Auth pages (phase d) live outside this group, without the shell.
export default function PortalLayout({ children }: { readonly children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
