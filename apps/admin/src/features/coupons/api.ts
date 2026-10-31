import { isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import { couponApiQuery, type CouponFilters } from './lib/list-params';

// Coupons (spec 03 AD-35…AD-37; backend spec 19 §4.3): platform coupons are created and edited here; seller
// coupons are read-only with Block / Unblock (PR-20).

export type Coupon = Schema<'CouponDto'>;
export type CouponDetail = Schema<'AdminCouponDetailDto'>;
export type Redemption = CouponDetail['redemptions'][number];

const COUPONS_PAGE_SIZE = 20;

export const couponKeys = {
  lists: () => queryKey('admin', 'coupons', 'list'),
  list: (filters: CouponFilters) => queryKey('admin', 'coupons', 'list', filters),
  detail: (couponId: string) => queryKey('admin', 'coupons', 'detail', { couponId }),
};

export function couponsListOptions(filters: CouponFilters) {
  return infiniteListOptions({
    queryKey: couponKeys.list(filters),
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/coupons', {
          params: {
            query: {
              limit: COUPONS_PAGE_SIZE,
              ...couponApiQuery(filters),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}

/** AD-37: stale 0; every write reads it again (the answer has no redemptions). */
export function couponQuery(couponId: string) {
  return queryOptions({
    queryKey: couponKeys.detail(couponId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/coupons/{couponId}', { params: { path: { couponId } }, signal }),
        )
      ).data,
    staleTime: 0,
  });
}

/** No such coupon, or not a coupon id at all (the backend checks the id format first, as R-36). */
export function isCouponMissing(error: unknown): boolean {
  return isApiError(error, 'COUPON_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}

export async function createCoupon(body: Schema<'AdminCreateCouponDto'>): Promise<Coupon> {
  return (await unwrap(browserApi.POST('/api/v1/admin/coupons', { body }))).data;
}

export async function updateCoupon(couponId: string, body: Schema<'AdminUpdateCouponDto'>): Promise<Coupon> {
  return (
    await unwrap(
      browserApi.PATCH('/api/v1/admin/coupons/{couponId}', { params: { path: { couponId } }, body }),
    )
  ).data;
}

export async function blockCoupon(couponId: string, reason: string): Promise<Coupon> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/coupons/{couponId}/block', {
        params: { path: { couponId } },
        body: { reason },
      }),
    )
  ).data;
}

export async function unblockCoupon(couponId: string): Promise<Coupon> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/coupons/{couponId}/unblock', { params: { path: { couponId } } }),
    )
  ).data;
}
