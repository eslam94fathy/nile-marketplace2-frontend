import { buttonVariants, MAIN_CONTENT_ID, NotFoundScreen } from '@nile/ui';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

const BACK_HOME = 'Go to the home page';

export const metadata: Metadata = { title: 'Page not found' };

/**
 * Rendered per request: the CSP nonce exists only then (design 01 §10, R-50). Reading nothing from the request,
 * this page would otherwise be prerendered at build time, and its scripts would carry no nonce and be blocked.
 */
export default async function NotFound() {
  await connection();
  const screen = (
    <NotFoundScreen
      homeLink={
        <Link href={ROUTES.overview} className={buttonVariants({ variant: 'outline' })}>
          {BACK_HOME}
        </Link>
      }
    />
  );
  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className="outline-none">
      {screen}
    </main>
  );
}
