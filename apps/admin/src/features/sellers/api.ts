import { isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import { sellerApiQuery, type SellerFilters } from './lib/list-params';

// Sellers (spec 03 AD-04, AD-05; design 02 §2.4 `sellers.*`, §3.4 "Seller decisions / commission").

export type AdminSeller = Schema<'AdminSellerListItemDto'>;
export type AdminSellerDetail = Schema<'AdminSellerDetailDto'>;

const SELLERS_PAGE_SIZE = 20;

export const sellerKeys = {
  lists: () => queryKey('admin', 'sellers', 'list'),
  list: (filters: SellerFilters) => queryKey('admin', 'sellers', 'list', filters),
  detail: (sellerId: string) => queryKey('admin', 'sellers', 'detail', { sellerId }),
  dashboard: () => queryKey('admin', 'dashboard', 'pendingSellers'),
};

export function sellersListOptions(filters: SellerFilters) {
  return infiniteListOptions({
    queryKey: sellerKeys.list(filters),
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/sellers', {
          params: {
            query: {
              limit: SELLERS_PAGE_SIZE,
              ...sellerApiQuery(filters),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}

/** AD-05: stale 0 (design 02 §2.4). */
export function sellerQuery(sellerId: string) {
  return queryOptions({
    queryKey: sellerKeys.detail(sellerId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/sellers/{sellerId}', { params: { path: { sellerId } }, signal }),
        )
      ).data,
    staleTime: 0,
  });
}

/** No such seller, or not a seller id at all (the backend checks the id format first, as R-36). */
export function isSellerMissing(error: unknown): boolean {
  return isApiError(error, 'SELLER_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}

const path = (sellerId: string) => ({ params: { path: { sellerId } } });

export async function approveSeller(sellerId: string): Promise<AdminSellerDetail> {
  return (await unwrap(browserApi.POST('/api/v1/admin/sellers/{sellerId}/approve', path(sellerId)))).data;
}

export async function rejectSeller(sellerId: string, reason: string): Promise<AdminSellerDetail> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/sellers/{sellerId}/reject', { ...path(sellerId), body: { reason } }),
    )
  ).data;
}

export async function suspendSeller(sellerId: string, reason: string): Promise<AdminSellerDetail> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/sellers/{sellerId}/suspend', { ...path(sellerId), body: { reason } }),
    )
  ).data;
}

/** The reason is optional: omitted, never `null`. */
export async function reinstateSeller(sellerId: string, reason: string | null): Promise<AdminSellerDetail> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/sellers/{sellerId}/reinstate', {
        ...path(sellerId),
        body: reason === null ? {} : { reason },
      }),
    )
  ).data;
}

export async function setCommissionRate(
  sellerId: string,
  commissionRate: string,
): Promise<AdminSellerDetail> {
  return (
    await unwrap(
      browserApi.PUT('/api/v1/admin/sellers/{sellerId}/commission-rate', {
        ...path(sellerId),
        body: { commissionRate },
      }),
    )
  ).data;
}
