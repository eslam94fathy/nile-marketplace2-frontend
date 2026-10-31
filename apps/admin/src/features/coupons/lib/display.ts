import type { Schema } from '@nile/api';
import { formatMoney, ratePercentValue } from '@nile/domain';
import type { Coupon } from '../api';
import { COUPONS_COPY as COPY } from '../copy';

// AD-35 / AD-37 texts (spec 03 §7.6) and the category choices of the form.

type CategoryNode = Schema<'AdminCategoryNodeDto'>;

/** One category the coupon can target: its id and full path ("Fashion › Men"). */
export interface CategoryChoice {
  readonly id: string;
  readonly path: string;
}

const PATH_SEPARATOR = ' › ';

/**
 * Every active category, any level, with its path (as SE-Q-13); an inactive category hides its subtree, since
 * nothing under it can be bought.
 */
export function categoryChoices(
  tree: readonly CategoryNode[],
  parents: readonly string[] = [],
): CategoryChoice[] {
  return [...tree]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((node) => node.isActive)
    .flatMap((node) => {
      const path = [...parents, node.name];
      return [{ id: node.id, path: path.join(PATH_SEPARATOR) }, ...categoryChoices(node.children, path)];
    });
}

/** "10 %, up to EGP 50.00" / "EGP 25.00 off". */
export function discountText(coupon: Coupon): string {
  if (coupon.discountType === 'fixed') return COPY.fixedDiscount(formatMoney(coupon.discountValue));
  return COPY.percentDiscount(
    ratePercentValue(coupon.discountValue),
    coupon.maxDiscount === null ? null : formatMoney(coupon.maxDiscount),
  );
}

export interface ScopeNames {
  readonly allLabel: string;
  readonly sellerName: (sellerId: string) => string | null;
  readonly categories: readonly CategoryChoice[];
}

/** "All products", the seller's name, or the category's path ("Unavailable category" once it is gone). */
export function scopeText(coupon: Coupon, { allLabel, sellerName, categories }: ScopeNames): string {
  if (coupon.scope === 'seller') {
    const sellerId = coupon.scopeSellerId ?? coupon.sellerId;
    return sellerId === null ? allLabel : (sellerName(sellerId) ?? COPY.shortId(sellerId));
  }
  if (coupon.scope === 'category' && coupon.scopeCategoryId !== null) {
    return (
      categories.find((choice) => choice.id === coupon.scopeCategoryId)?.path ?? COPY.unavailableCategory
    );
  }
  return allLabel;
}

/** "Nile", or the funding seller's name. */
export function fundingText(
  coupon: Coupon,
  sellerName: (sellerId: string) => string | null,
  nile: string,
): string {
  if (coupon.funding === 'platform' || coupon.sellerId === null) return nile;
  return sellerName(coupon.sellerId) ?? COPY.shortId(coupon.sellerId);
}
