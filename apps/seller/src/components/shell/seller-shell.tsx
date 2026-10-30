'use client';

import { NotificationBell } from '@nile/notifications';
import {
  Button,
  Dialog,
  DialogContent,
  isActivePath,
  MAIN_CONTENT_ID,
  navLinkClasses,
  PortalBrand,
  UI_COPY,
} from '@nile/ui';
import {
  Banknote,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Package,
  ShieldCheck,
  ShoppingBag,
  Store,
  TicketPercent,
  Star,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { BusinessIdentity, StatusBanner } from '@/features/profile';
import { APP } from '@/lib/app';
import { ROUTES } from '@/lib/routes';
import { sessionClient } from '@/lib/session-client';

// Seller shell (spec 02 §2.1): sidebar on desktop, bottom-sheet menu on mobile; header with the business
// name and status badge, the notification bell (T-J6), and the status banner (§2.2) above every portal page, from `GET /seller/profile`.

const NAV = [
  { href: ROUTES.overview, label: 'Overview', icon: LayoutDashboard },
  { href: ROUTES.orders, label: 'Orders', icon: ShoppingBag },
  { href: ROUTES.returns, label: 'Returns', icon: Undo2 },
  { href: ROUTES.products, label: 'Products', icon: Package },
  { href: ROUTES.reviews, label: 'Reviews', icon: Star },
  { href: ROUTES.coupons, label: 'Coupons', icon: TicketPercent },
  { href: ROUTES.finance, label: 'Finance', icon: Banknote },
  { href: ROUTES.support, label: 'Support', icon: LifeBuoy },
  { href: ROUTES.profile, label: 'Profile', icon: Store },
  { href: ROUTES.security, label: 'Security', icon: ShieldCheck },
] as const;

const NAV_LABEL = 'Seller portal';

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
      <Button
        variant="ghost"
        className="justify-start gap-3 px-3"
        onClick={() => {
          void sessionClient.signOut();
        }}
      >
        <LogOut aria-hidden="true" />
        {UI_COPY.signOut}
      </Button>
    </nav>
  );
}

function Brand() {
  return (
    <Link href={ROUTES.overview} className="w-fit rounded-md">
      <PortalBrand roleLabel={APP.roleLabel} />
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
          <div className="ms-auto flex min-w-0 items-center gap-2">
            <NotificationBell />
            <BusinessIdentity />
          </div>
        </header>
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 p-4 outline-none lg:p-8">
          <StatusBanner />
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
