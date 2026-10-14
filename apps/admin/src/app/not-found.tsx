import { buttonVariants, MAIN_CONTENT_ID, NotFoundScreen } from '@nile/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

const BACK_HOME = 'Go to the home page';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  const screen = (
    <NotFoundScreen
      homeLink={
        <Link href={ROUTES.dashboard} className={buttonVariants({ variant: 'outline' })}>
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
