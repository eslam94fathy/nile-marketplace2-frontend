import { NOTIFICATIONS_COPY } from '@nile/notifications';
import { isActivePath } from '@nile/ui';
import {
  Bell,
  Heart,
  LifeBuoy,
  MapPin,
  Package,
  RotateCcw,
  ShieldCheck,
  Star,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { WISHLIST_COPY } from '@/features/wishlist';
import { ROUTES } from '@/lib/routes';
import { ACCOUNT_COPY } from './copy';

// Account navigation (spec 01 §10.2, SF-Q-13): one list for the desktop side navigation, the phone menu page
// and the header's account menu. Not a 'use client' module, so server code can read it too (R-29).

export interface AccountNavItem {
  readonly href:
    | typeof ROUTES.account
    | typeof ROUTES.orders
    | typeof ROUTES.returns
    | typeof ROUTES.reviews
    | typeof ROUTES.wishlist
    | typeof ROUTES.addresses
    | typeof ROUTES.notifications
    | typeof ROUTES.support
    | typeof ROUTES.security;
  readonly label: string;
  readonly icon: LucideIcon;
}

export const ACCOUNT_NAV: readonly AccountNavItem[] = [
  { href: ROUTES.account, label: ACCOUNT_COPY.profile, icon: UserRound },
  { href: ROUTES.orders, label: ACCOUNT_COPY.orders, icon: Package },
  { href: ROUTES.returns, label: ACCOUNT_COPY.returns, icon: RotateCcw },
  { href: ROUTES.reviews, label: ACCOUNT_COPY.reviews, icon: Star },
  { href: ROUTES.wishlist, label: WISHLIST_COPY.title, icon: Heart },
  { href: ROUTES.addresses, label: ACCOUNT_COPY.addresses, icon: MapPin },
  { href: ROUTES.notifications, label: NOTIFICATIONS_COPY.title, icon: Bell },
  { href: ROUTES.support, label: ACCOUNT_COPY.support, icon: LifeBuoy },
  { href: ROUTES.security, label: ACCOUNT_COPY.security, icon: ShieldCheck },
];

/** Profile is `/account` itself, the prefix of every other entry: it is active only on its own page. */
export function isAccountNavActive(pathname: string, href: AccountNavItem['href']): boolean {
  return href === ROUTES.account ? pathname === href : isActivePath(pathname, href);
}
