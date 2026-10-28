'use client';

import { NotificationBell } from '@nile/notifications';
import { cn, isActivePath, MAIN_CONTENT_ID, PortalBrand } from '@nile/ui';
import { History, Package, User, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { InactiveBanner, ShiftSwitch } from '@/features/profile';
import { APP } from '@/lib/app';
import { ROUTES } from '@/lib/routes';

// Agent shell (spec 04 §2.1): mobile-first, one hand. Top bar with the notification bell (T-J6, spec 04 §7.2) and the shift switch, bottom navigation with
// 48 px targets; on desktop the same layout in a narrow centred column. The inactive banner sits under the
// top bar (spec 04 §2.2).

const NAV = [
  { href: ROUTES.shipments, label: 'Shipments', icon: Package },
  { href: ROUTES.history, label: 'History', icon: History },
  { href: ROUTES.finance, label: 'Finance', icon: Wallet },
  { href: ROUTES.me, label: 'Me', icon: User },
] as const;

const NAV_LABEL = 'Delivery app';

function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label={NAV_LABEL}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AgentShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col border-x border-border">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background px-4">
        <Link href={ROUTES.shipments} className="rounded-md">
          <PortalBrand roleLabel={APP.roleLabel} />
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <ShiftSwitch />
        </div>
      </header>
      <InactiveBanner />
      {/* Bottom padding keeps the last content above the fixed navigation. */}
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 p-4 pb-24 outline-none">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
