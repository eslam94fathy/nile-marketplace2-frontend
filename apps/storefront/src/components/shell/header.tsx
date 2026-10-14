'use client';

import { Button, Dialog, DialogContent } from '@nile/ui';
import { LayoutGrid, ShoppingCart, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { APP } from '@/lib/app';
import { RETURN_TO_PARAM, ROUTES } from '@/lib/routes';
import { SearchBox } from './search-box';

// Storefront header (spec 01 §2.2). The categories menu, the signed-in account area and the cart badge are
// data islands added later (T-E1, phase d, T-F1); until then it shows the signed-out state, which is also the
// real behaviour for visitors (FQ-6: the cart needs sign-in).

const CATEGORIES = 'Categories';
const CATEGORIES_PLACEHOLDER = 'The category menu arrives with T-E1.';
const SIGN_IN = 'Sign in';
const CREATE_ACCOUNT = 'Create account';
const CART = 'Cart';
const ACCOUNT_NAV_LABEL = 'Account';

function returnTo(pathname: string) {
  return { [RETURN_TO_PARAM]: pathname };
}

export function Header() {
  const pathname = usePathname();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <Link href={ROUTES.home} className="text-xl font-semibold text-primary">
          {APP.title}
        </Link>
        <Button
          variant="ghost"
          aria-expanded={categoriesOpen}
          onClick={() => {
            setCategoriesOpen(true);
          }}
        >
          <LayoutGrid aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{CATEGORIES}</span>
        </Button>
        <SearchBox className="order-last w-full md:order-none md:w-auto md:flex-1" />
        <nav aria-label={ACCOUNT_NAV_LABEL} className="ms-auto flex items-center gap-1 md:ms-0">
          <Link
            href={{ pathname: ROUTES.login, query: returnTo(pathname) }}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <User aria-hidden="true" className="size-4" />
            {SIGN_IN}
          </Link>
          <Link
            href={{ pathname: ROUTES.register, query: returnTo(pathname) }}
            className="hidden rounded-md px-3 py-2 text-sm font-medium hover:bg-muted sm:inline-flex"
          >
            {CREATE_ACCOUNT}
          </Link>
          <Link
            href={{ pathname: ROUTES.login, query: returnTo(ROUTES.cart) }}
            aria-label={CART}
            className="inline-flex size-10 items-center justify-center rounded-md hover:bg-muted"
          >
            <ShoppingCart aria-hidden="true" className="size-5" />
          </Link>
        </nav>
      </div>
      <Dialog open={categoriesOpen} onOpenChange={setCategoriesOpen}>
        <DialogContent title={CATEGORIES} placement="start">
          <p className="text-sm text-muted-foreground">{CATEGORIES_PLACEHOLDER}</p>
        </DialogContent>
      </Dialog>
    </header>
  );
}
