import type { ReactNode } from 'react';
import { SellerShell } from '@/components/shell/seller-shell';

// Signed-in area of the app. Auth pages (phase d) live outside this group, without the shell.
export default function PortalLayout({ children }: { readonly children: ReactNode }) {
  return <SellerShell>{children}</SellerShell>;
}
