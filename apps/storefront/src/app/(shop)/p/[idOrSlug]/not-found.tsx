import { buttonVariants, NotFoundScreen } from '@nile/ui';
import Link from 'next/link';
import { CATALOG_COPY } from '@/features/catalog';
import { ROUTES } from '@/lib/routes';

const BACK_HOME = 'Go to the home page';

/** SF-05 / SF-21: hidden, deleted or suspended-seller products (HTTP 404). */
export default function ProductNotFound() {
  return (
    <NotFoundScreen
      message={CATALOG_COPY.productUnavailable}
      homeLink={
        <Link href={ROUTES.home} className={buttonVariants({ variant: 'outline' })}>
          {BACK_HOME}
        </Link>
      }
    />
  );
}
