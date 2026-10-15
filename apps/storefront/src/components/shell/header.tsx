'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AccountArea } from '@/features/account';
import { CategoriesMenu } from '@/features/catalog';
import { APP } from '@/lib/app';
import { ROUTES } from '@/lib/routes';
import { SearchBox } from './search-box';

// Storefront header (spec 01 §2.2). Client islands: the categories menu (tree hydrated from the server
// render), the account area (T-D4); the cart badge is added with T-F1.

export function Header() {
  const pathname = usePathname();
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <Link href={ROUTES.home} className="text-xl font-semibold text-primary">
          {APP.title}
        </Link>
        <CategoriesMenu />
        <SearchBox className="order-last w-full md:order-none md:w-auto md:flex-1" />
        <AccountArea pathname={pathname} />
      </div>
    </header>
  );
}
