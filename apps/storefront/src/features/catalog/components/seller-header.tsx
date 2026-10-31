import type { Schema } from '@nile/api';
import { formatMonthYear } from '@nile/domain';
import { RatingStars } from '@nile/ui';
import { CATALOG_COPY } from '../copy';

export type PublicSeller = Schema<'PublicSellerDto'>;

/** SF-22 header: the business name (h1), its rating or "No reviews yet", and when it started selling. */
export function SellerHeader({ seller }: { readonly seller: PublicSeller }) {
  return (
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">{seller.businessName}</h1>
      {seller.ratingCount === 0 || seller.ratingAvg === null ? (
        <p className="text-sm text-muted-foreground">{CATALOG_COPY.noReviewsYet}</p>
      ) : (
        <RatingStars avg={seller.ratingAvg} count={seller.ratingCount} />
      )}
      <p className="text-sm text-muted-foreground">
        {CATALOG_COPY.sellingSince(formatMonthYear(seller.memberSince))}
      </p>
    </header>
  );
}
