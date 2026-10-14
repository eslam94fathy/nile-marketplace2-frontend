'use client';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  isActivePath,
  MAIN_CONTENT_ID,
  navLinkClasses,
  UI_COPY,
} from '@nile/ui';
import {
  Banknote,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShieldCheck,
  ShoppingBag,
  Store,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { APP } from '@/lib/app';
import { ROUTES } from '@/lib/routes';

// Seller shell (spec 02 §2.1): sidebar on desktop, bottom-sheet menu on mobile; header with the business
// name and status badge. Business name and status are stand-ins until T-H1 loads `GET /seller/profile`;
// "Sign out" is enabled with the session in phase d.

const NAV = [
  { href: ROUTES.overview, label: 'Overview', icon: LayoutDashboard },
  { href: ROUTES.orders, label: 'Orders', icon: ShoppingBag },
  { href: ROUTES.products, label: 'Products', icon: Package },
  { href: ROUTES.finance, label: 'Finance', icon: Banknote },
  { href: ROUTES.profile, label: 'Profile', icon: Store },
  { href: ROUTES.security, label: 'Security', icon: ShieldCheck },
] as const;

const NAV_LABEL = 'Seller portal';
const BUSINESS_NAME_PLACEHOLDER = 'Your business';
const STATUS_PLACEHOLDER = 'Status';

function NavLinks({ onNavigate }: { readonly onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label={NAV_LABEL} className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={navLinkClasses(active)}
            onClick={() => onNavigate?.()}
          >
            <Icon aria-hidden="true" />
            {label}
          </Link>
        );
      })}
      <Button variant="ghost" disabled className="justify-start gap-3 px-3">
        <LogOut aria-hidden="true" />
        {UI_COPY.signOut}
      </Button>
    </nav>
  );
}

function Brand() {
  return (
    <Link href={ROUTES.overview} className="text-lg font-semibold text-primary">
      {APP.title}
    </Link>
  );
}

export function SellerShell({ children }: { readonly children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden border-e border-border bg-slate-50 lg:flex lg:flex-col lg:gap-6 lg:p-4">
        <Brand />
        <NavLinks />
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
          <div className="ms-auto flex items-center gap-2 text-sm">
            <span className="font-medium">{BUSINESS_NAME_PLACEHOLDER}</span>
            <Badge>{STATUS_PLACEHOLDER}</Badge>
          </div>
        </header>
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 p-4 outline-none lg:p-8">
          {children}
        </main>
      </div>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent title={UI_COPY.menu} placement="bottom">
          <NavLinks
            onNavigate={() => {
              setMenuOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
