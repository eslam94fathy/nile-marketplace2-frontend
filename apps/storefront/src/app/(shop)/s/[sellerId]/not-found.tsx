import { buttonVariants, NotFoundScreen } from '@nile/ui';
import Link from 'next/link';
import { CATALOG_COPY } from '@/features/catalog';
import { ROUTES } from '@/lib/routes';

const BACK_HOME = 'Go to the home page';

/** SF-22 / SF-21: a seller that isn't approved or doesn't exist (HTTP 404). */
export default function SellerNotFound() {
  return (
    <NotFoundScreen
      message={CATALOG_COPY.sellerUnavailable}
      homeLink={
        <Link href={ROUTES.home} className={buttonVariants({ variant: 'outline' })}>
          {BACK_HOME}
        </Link>
      }
    />
  );
}
