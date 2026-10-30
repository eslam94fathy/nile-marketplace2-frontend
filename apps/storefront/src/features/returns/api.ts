import { inValues, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// Returns (spec 01 SF-26…SF-28; design 02 §2.2). Every key starts with `['storefront', 'returns']`, so the
// realtime `return.updated` and every write refresh the list, the detail and the returnable items at once.

export type Return = Schema<'ReturnDto'>;
export type ReturnableItems = Schema<'ReturnableItemsDto'>;
export type RequestReturnBody = Schema<'RequestReturnDto'>;
export type ReturnStatus = Return['status'];
export type ReturnReason = Return['reason'];

export const RETURNS_PAGE_SIZE = 20;

/** SF-27 tabs: what is still moving vs finished (spec 01 SF-27). */
export const RETURN_TAB_STATUSES = {
  open: ['requested', 'rejected', 'escalated', 'approved', 'picked_up', 'received', 'disputed'],
  closed: ['completed', 'refused', 'cancelled', 'pickup_failed'],
} as const satisfies Record<string, readonly ReturnStatus[]>;
export type ReturnsTab = keyof typeof RETURN_TAB_STATUSES;

export const returnKeys = {
  all: () => ['storefront', 'returns'] as const,
  list: (tab: ReturnsTab) => queryKey('storefront', 'returns', 'list', { tab }),
  detail: (returnId: string) => queryKey('storefront', 'returns', 'detail', { returnId }),
  returnable: (orderId: string, sellerOrderId: string) =>
    queryKey('storefront', 'returns', 'returnable', { orderId, sellerOrderId }),
};

export function returnableItemsQuery(orderId: string, sellerOrderId: string) {
  return queryOptions({
    queryKey: returnKeys.returnable(orderId, sellerOrderId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/orders/{orderId}/seller-orders/{sellerOrderId}/returnable-items', {
            params: { path: { orderId, sellerOrderId } },
            signal,
          }),
        )
      ).data,
    staleTime: 0,
    // A refusal (window closed, not allowed) is an answer the screen explains.
    retry: false,
  });
}

export function returnsListOptions(tab: ReturnsTab) {
  return infiniteListOptions({
    queryKey: returnKeys.list(tab),
    fetchPage: async (cursor, signal) => {
      const { data, meta } = await unwrap(
        browserApi.GET('/api/v1/returns', {
          params: {
            query: {
              limit: RETURNS_PAGE_SIZE,
              sort: '-createdAt',
              'status[in]': inValues(RETURN_TAB_STATUSES[tab]),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      );
      return { data, meta };
    },
  });
}

export function returnQuery(returnId: string) {
  return queryOptions({
    queryKey: returnKeys.detail(returnId),
    queryFn: async ({ signal }) =>
      (await unwrap(browserApi.GET('/api/v1/returns/{returnId}', { params: { path: { returnId } }, signal })))
        .data,
  });
}

/** `POST /returns` with the key of this intent (one per body, design 02 §3.1). */
export async function requestReturn(body: RequestReturnBody, idempotencyKey: string): Promise<Return> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/returns', { body, params: { header: { 'Idempotency-Key': idempotencyKey } } }),
    )
  ).data;
}

export async function cancelReturn(returnId: string): Promise<Return> {
  return (
    await unwrap(browserApi.POST('/api/v1/returns/{returnId}/cancel', { params: { path: { returnId } } }))
  ).data;
}

export async function escalateReturn(returnId: string, note: string): Promise<Return> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/returns/{returnId}/escalate', {
        params: { path: { returnId } },
        body: { note },
      }),
    )
  ).data;
}
