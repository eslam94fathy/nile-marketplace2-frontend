import { isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// The seller's coupons (design 02 §5.2 `coupons.list(status)` / `.detail(id)`, §5.4 create / edit).

export type Coupon = Schema<'CouponDto'>;
export type CouponStatusFilter = 'active' | 'inactive' | null;

const COUPONS_PAGE_SIZE = 20;

export const couponKeys = {
  all: () => ['seller', 'coupons'] as const,
  lists: () => queryKey('seller', 'coupons', 'list'),
  list: (status: CouponStatusFilter) => queryKey('seller', 'coupons', 'list', { status }),
  detail: (couponId: string) => queryKey('seller', 'coupons', 'detail', { couponId }),
};

/** SE-21: newest first, 20 per page, `status[eq]` from the URL. */
export function couponsListOptions(status: CouponStatusFilter) {
  return infiniteListOptions({
    queryKey: couponKeys.list(status),
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/seller/coupons', {
          params: {
            query: {
              limit: COUPONS_PAGE_SIZE,
              sort: '-createdAt',
              ...(status === null ? {} : { 'status[eq]': status }),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}

/** SE-23: stale 0, the form always starts from the last answer. */
export function couponQuery(couponId: string) {
  return queryOptions({
    queryKey: couponKeys.detail(couponId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/seller/coupons/{couponId}', { params: { path: { couponId } }, signal }),
        )
      ).data,
    staleTime: 0,
  });
}

/** Not this seller's coupon (`COUPON_NOT_FOUND`), or the id in the URL isn't an id (`VALIDATION_FAILED`). */
export function isCouponMissing(error: unknown): boolean {
  return isApiError(error, 'COUPON_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}

export async function createCoupon(body: Schema<'SellerCreateCouponDto'>): Promise<Coupon> {
  return (await unwrap(browserApi.POST('/api/v1/seller/coupons', { body }))).data;
}

export async function updateCoupon(couponId: string, body: Schema<'SellerUpdateCouponDto'>): Promise<Coupon> {
  return (
    await unwrap(
      browserApi.PATCH('/api/v1/seller/coupons/{couponId}', { params: { path: { couponId } }, body }),
    )
  ).data;
}
