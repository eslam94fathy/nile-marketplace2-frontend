'use client';

import { Button, Dialog, DialogContent } from '@nile/ui';
import { LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { APP } from '@/lib/app';
import { AccountArea } from '@/features/account';
import { ROUTES } from '@/lib/routes';
import { SearchBox } from './search-box';

// Storefront header (spec 01 §2.2). The account area is a client island (signed-out links or the customer's
// menu, T-D4); the categories menu and the cart badge are data islands added later (T-E1, T-F1).

const CATEGORIES = 'Categories';
const CATEGORIES_PLACEHOLDER = 'The category menu arrives with T-E1.';

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
        <AccountArea pathname={pathname} />
      </div>
      <Dialog open={categoriesOpen} onOpenChange={setCategoriesOpen}>
        <DialogContent title={CATEGORIES} placement="start">
          <p className="text-sm text-muted-foreground">{CATEGORIES_PLACEHOLDER}</p>
        </DialogContent>
      </Dialog>
    </header>
  );
}
