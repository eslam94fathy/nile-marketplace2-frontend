'use client';

import { buttonVariants, cn, navLinkClasses, UI_COPY } from '@nile/ui';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ROUTES } from '@/lib/routes';
import { sessionClient } from '@/lib/session-client';
import { ACCOUNT_NAV_COPY as COPY } from '../copy';
import { ACCOUNT_NAV, isAccountNavActive } from '../nav';

/** Desktop side navigation (SF-Q-13); `aria-current="page"` marks the section, also for screen readers. */
function SideNav({ pathname }: { readonly pathname: string }) {
  return (
    <nav aria-label={COPY.navLabel} className="hidden md:block">
      <ul className="sticky top-4 space-y-1">
        {ACCOUNT_NAV.map(({ href, label, icon: Icon }) => {
          const active = isAccountNavActive(pathname, href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? 'page' : undefined} className={navLinkClasses(active)}>
                <Icon aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Frame of every account page (SF-Q-13): the side navigation beside the page from `md` up; on phones a link
 * back to the account menu page above it instead. The menu page itself is the navigation, so it gets neither.
 */
export function AccountFrame({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === ROUTES.accountMenu) return children;
  return (
    <div className="md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
      <SideNav pathname={pathname} />
      <div className="min-w-0">
        <Link
          href={ROUTES.accountMenu}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ms-2 mb-4 md:hidden')}
        >
          <ChevronLeft aria-hidden="true" />
          {COPY.menuTitle}
        </Link>
        {children}
      </div>
    </div>
  );
}

/** Phone account menu page (SF-Q-13): every account section, then sign-out. */
export function AccountMenu() {
  return (
    <nav aria-label={COPY.navLabel}>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {ACCOUNT_NAV.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-muted"
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="flex-1">{label}</span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-3 text-start text-sm font-medium hover:bg-muted"
            onClick={() => {
              void sessionClient.signOut();
            }}
          >
            <LogOut aria-hidden="true" className="size-4 shrink-0" />
            {UI_COPY.signOut}
          </button>
        </li>
      </ul>
    </nav>
  );
}
