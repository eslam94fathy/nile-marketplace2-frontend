'use client';

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
import { ChevronDown, ShoppingCart, User } from 'lucide-react';
import Link from 'next/link';
import { RETURN_TO_PARAM, ROUTES } from '@/lib/routes';
import { sessionClient } from '@/lib/session-client';
import { profileQuery } from '../api';
import { ACCOUNT_COPY } from '../copy';
import { useHasSession } from '../hooks';

const LINK = 'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted';
const ICON_LINK = 'inline-flex size-10 items-center justify-center rounded-md hover:bg-muted';

const MENU_LINKS = [
  { href: ROUTES.orders, label: ACCOUNT_COPY.orders },
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
 * "Hi, {firstName}" menu with sign-out for customers. The cart count arrives with T-F1.
 */
export function AccountArea({ pathname }: { readonly pathname: string }) {
  const signedIn = useHasSession();
  return (
    <nav aria-label={ACCOUNT_COPY.navLabel} className="ms-auto flex items-center gap-1 md:ms-0">
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
      <Link
        href={signedIn ? ROUTES.cart : { pathname: ROUTES.login, query: { [RETURN_TO_PARAM]: ROUTES.cart } }}
        aria-label={ACCOUNT_COPY.cart}
        className={ICON_LINK}
      >
        <ShoppingCart aria-hidden="true" className="size-5" />
      </Link>
    </nav>
  );
}
