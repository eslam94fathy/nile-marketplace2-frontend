'use client';

import { NOTIFICATIONS_COPY, NotificationBell } from '@nile/notifications';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  UI_COPY,
} from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Heart, ShoppingCart, User } from 'lucide-react';
import Link from 'next/link';
import { CartLink } from '@/features/cart';
import { WISHLIST_COPY } from '@/features/wishlist';
import { RETURN_TO_PARAM, ROUTES } from '@/lib/routes';
import { sessionClient } from '@/lib/session-client';
import { profileQuery } from '../api';
import { ACCOUNT_COPY } from '../copy';
import { useHasSession } from '@/lib/use-has-session';

const LINK = 'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted';
const ICON_LINK = 'inline-flex size-10 items-center justify-center rounded-md hover:bg-muted';

const MENU_LINKS = [
  { href: ROUTES.orders, label: ACCOUNT_COPY.orders },
  { href: ROUTES.wishlist, label: WISHLIST_COPY.title },
  { href: ROUTES.notifications, label: NOTIFICATIONS_COPY.title },
  { href: ROUTES.addresses, label: ACCOUNT_COPY.addresses },
  { href: ROUTES.account, label: ACCOUNT_COPY.account },
  { href: ROUTES.security, label: ACCOUNT_COPY.security },
] as const;

function SignedInMenu() {
  // While loading or after a failure the menu still works; only the greeting needs the profile.
  const profile = useQuery(profileQuery());
  const label =
    profile.data === undefined ? ACCOUNT_COPY.menu : ACCOUNT_COPY.greeting(profile.data.firstName);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">
          <User aria-hidden="true" />
          <span className="max-w-40 truncate">{label}</span>
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {MENU_LINKS.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href}>{item.label}</Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void sessionClient.signOut();
          }}
        >
          {UI_COPY.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Header account area and cart link (spec 01 §2.2): sign-in links for visitors (with `returnTo`), the
 * notification bell (T-J6), the wishlist link (T-K3) and the "Hi, {firstName}" menu with sign-out for customers, and the cart button
 * with its count (T-F1).
 */
export function AccountArea({ pathname }: { readonly pathname: string }) {
  const signedIn = useHasSession();
  return (
    <nav aria-label={ACCOUNT_COPY.navLabel} className="ms-auto flex items-center gap-1 md:ms-0">
      {signedIn ? <NotificationBell /> : null}
      {signedIn ? (
        <SignedInMenu />
      ) : (
        <>
          <Link href={{ pathname: ROUTES.login, query: { [RETURN_TO_PARAM]: pathname } }} className={LINK}>
            <User aria-hidden="true" className="size-4" />
            {ACCOUNT_COPY.signIn}
          </Link>
          <Link
            href={{ pathname: ROUTES.register, query: { [RETURN_TO_PARAM]: pathname } }}
            className="hidden rounded-md px-3 py-2 text-sm font-medium hover:bg-muted sm:inline-flex"
          >
            {ACCOUNT_COPY.createAccount}
          </Link>
        </>
      )}
      {signedIn ? (
        <Link href={ROUTES.wishlist} aria-label={WISHLIST_COPY.title} className={ICON_LINK}>
          <Heart aria-hidden="true" className="size-5" />
        </Link>
      ) : null}
      {signedIn ? (
        <CartLink className={ICON_LINK} />
      ) : (
        <Link
          href={{ pathname: ROUTES.login, query: { [RETURN_TO_PARAM]: ROUTES.cart } }}
          aria-label={ACCOUNT_COPY.cart}
          className={ICON_LINK}
        >
          <ShoppingCart aria-hidden="true" className="size-5" />
        </Link>
      )}
    </nav>
  );
}
