import { MAIN_CONTENT_ID, PortalBrand } from '@nile/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AgentAuthScreens } from '@/features/auth';
import { APP } from '@/lib/app';
import { ROUTES } from '@/lib/routes';

// Sign-in screens sit outside the portal shell (no navigation), so this layout gives them the brand and the
// page's single <main>.
export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <AgentAuthScreens>
      <header className="border-b border-border px-4 py-3">
        <Link href={ROUTES.login} className="inline-block rounded-md">
          <PortalBrand roleLabel={APP.roleLabel} />
        </Link>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="px-4 outline-none">
        {children}
      </main>
    </AgentAuthScreens>
  );
}
