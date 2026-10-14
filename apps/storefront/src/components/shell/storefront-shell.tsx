import { MAIN_CONTENT_ID } from '@nile/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { APP } from '@/lib/app';
import { ROUTES } from '@/lib/routes';
import { Header } from './header';

// Storefront shell (spec 01 §2): header on every page · main · footer. Server-rendered; only the header is a
// client component (current path for returnTo, the categories drawer, the search box).

const FOOTER_NAV_LABEL = 'Footer';
const HOME = 'Home';
const YOUR_ORDERS = 'Your orders';

function Footer() {
  return (
    <footer className="border-t border-border bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground">
        <p>
          © {new Date().getFullYear()} {APP.title}
        </p>
        <nav aria-label={FOOTER_NAV_LABEL} className="flex gap-4">
          <Link href={ROUTES.home} className="hover:text-foreground hover:underline">
            {HOME}
          </Link>
          <Link href={ROUTES.orders} className="hover:text-foreground hover:underline">
            {YOUR_ORDERS}
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function StorefrontShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none"
      >
        {children}
      </main>
      <Footer />
    </div>
  );
}
