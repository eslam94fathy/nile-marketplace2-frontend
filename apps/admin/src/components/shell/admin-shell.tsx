'use client';

import {
  Button,
  Dialog,
  DialogContent,
  isActivePath,
  MAIN_CONTENT_ID,
  navLinkClasses,
  UI_COPY,
} from '@nile/ui';
import { LogOut, Menu, Monitor, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { APP } from '@/lib/app';
import { ROUTES } from '@/lib/routes';

// Admin shell (spec 03 §2.1, AD-Q-8): desktop-first sidebar in groups; below 1024 px the sidebar moves into
// a menu sheet; phones get a "best on a larger screen" note but keep working. The account menu shows the
// signed-in admin's email from phase d; until then a stand-in.

const NAV_GROUPS = [
  { label: null, items: [{ href: ROUTES.dashboard, label: 'Dashboard' }] },
  {
    label: 'Marketplace',
    items: [
      { href: ROUTES.sellers, label: 'Sellers' },
      { href: ROUTES.orders, label: 'Orders' },
      { href: ROUTES.refunds, label: 'Refunds' },
    ],
  },
  { label: 'Catalog', items: [{ href: ROUTES.categories, label: 'Categories' }] },
  {
    label: 'Delivery',
    items: [
      { href: ROUTES.shipments, label: 'Shipments' },
      { href: ROUTES.agents, label: 'Agents' },
      { href: ROUTES.deliverySettings, label: 'Delivery settings' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: ROUTES.financeAccounts, label: 'Accounts' },
      { href: ROUTES.remittances, label: 'COD remittances' },
      { href: ROUTES.payouts, label: 'Payouts' },
      { href: ROUTES.referenceLookup, label: 'Reference lookup' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: ROUTES.commission, label: 'Commission' },
      { href: ROUTES.admins, label: 'Admins' },
    ],
  },
] as const;

const NAV_LABEL = 'Admin console';
const ACCOUNT_PLACEHOLDER = 'Signed-in admin';
const SMALL_SCREEN_NOTE = 'The admin console works best on a larger screen.';

function NavGroups({ onNavigate }: { readonly onNavigate?: () => void }) {
  const pathname = usePathname();
  const idPrefix = useId();
  return (
    <nav aria-label={NAV_LABEL} className="flex flex-col gap-4">
      {NAV_GROUPS.map((group, index) => {
        const headingId = `${idPrefix}-group-${index}`;
        return (
          <div key={group.label ?? 'home'} className="flex flex-col gap-1">
            {group.label === null ? null : (
              // A label, not a heading: page headings start at each page's <h1>.
              <p
                id={headingId}
                className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {group.label}
              </p>
            )}
            <ul
              aria-labelledby={group.label === null ? undefined : headingId}
              className="flex flex-col gap-1"
            >
              {group.items.map(({ href, label }) => {
                const active = isActivePath(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={navLinkClasses(active)}
                      onClick={() => onNavigate?.()}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function AccountMenu() {
  const pathname = usePathname();
  const active = isActivePath(pathname, ROUTES.security);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="hidden text-muted-foreground sm:inline">{ACCOUNT_PLACEHOLDER}</span>
      <Link
        href={ROUTES.security}
        aria-current={active ? 'page' : undefined}
        className={navLinkClasses(active)}
      >
        <ShieldCheck aria-hidden="true" />
        Security
      </Link>
      <Button variant="ghost" size="sm" disabled>
        <LogOut aria-hidden="true" />
        {UI_COPY.signOut}
      </Button>
    </div>
  );
}

function Brand() {
  return (
    <Link href={ROUTES.dashboard} className="text-lg font-semibold text-primary">
      {APP.title}
    </Link>
  );
}

export function AdminShell({ children }: { readonly children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden overflow-y-auto border-e border-border bg-slate-50 lg:flex lg:flex-col lg:gap-6 lg:p-4">
        <Brand />
        <NavGroups />
      </aside>
      <div className="flex min-h-dvh flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border px-4 lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              aria-label={UI_COPY.menu}
              aria-expanded={menuOpen}
              onClick={() => {
                setMenuOpen(true);
              }}
            >
              <Menu aria-hidden="true" />
            </Button>
            <Brand />
          </div>
          <div className="ms-auto">
            <AccountMenu />
          </div>
        </header>
        <p className="flex items-center gap-2 border-b border-border bg-accent px-4 py-2 text-sm text-accent-foreground md:hidden">
          <Monitor aria-hidden="true" className="size-4 shrink-0" />
          {SMALL_SCREEN_NOTE}
        </p>
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 p-4 outline-none lg:p-8">
          {children}
        </main>
      </div>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent title={UI_COPY.menu} placement="start">
          <NavGroups
            onNavigate={() => {
              setMenuOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
