import { inValues, isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import type { ReturnTab } from './lib/tabs';

// Returns of the seller's orders (design 02 §5.2 `returns.*`, §5.4 mutations). Lists and detail follow
// `return.updated`; only the overview queues keep the 60 s fallback poll without a socket (spec 02 §8.5).

export type SellerReturn = Schema<'SellerReturnDto'>;
export type SellerReturnItem = Schema<'ReturnItemDto'>;

/** SE-06 fallback polling, only while no socket is connected (as the order queues, spec 02 §8.3). */
export const RETURN_QUEUES_POLL_MS = 60_000;
const fallbackPoll = (live: boolean): number | false => (live ? false : RETURN_QUEUES_POLL_MS);
const RETURNS_PAGE_SIZE = 20;
const OVERVIEW_SIZE = 5;

export type ReturnQueue = 'toDecide' | 'toCheck';

export const returnKeys = {
  /** Prefix of every return key (lists, detail, overview queues). */
  all: () => ['seller', 'returns'] as const,
  lists: () => queryKey('seller', 'returns', 'list'),
  list: (tab: string) => queryKey('seller', 'returns', 'list', { tab }),
  detail: (returnId: string) => queryKey('seller', 'returns', 'detail', { returnId }),
  overview: (queue: ReturnQueue) => queryKey('seller', 'returns', 'overview', { queue }),
};

/** SE-18: one tab, 20 per page, the tab's statuses and sort. */
export function returnsListOptions(tab: ReturnTab) {
  return infiniteListOptions({
    queryKey: returnKeys.list(tab.key),
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/seller/returns', {
          params: {
            query: {
              limit: RETURNS_PAGE_SIZE,
              sort: tab.sort,
              // The decision-deadline sort is offered with `status[eq]=requested` only [VERIFIED OpenAPI].
              ...(tab.statuses.length === 1
                ? { 'status[eq]': tab.statuses[0] }
                : { 'status[in]': inValues(tab.statuses) }),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}

const QUEUE_QUERY = {
  toDecide: { 'status[eq]': 'requested', sort: 'sellerDecisionDeadlineAt' },
  toCheck: { 'status[eq]': 'received', sort: 'createdAt' },
} as const;

/** SE-06 (SE-Q-11): the 5 returns to decide by deadline, the 5 oldest to check. */
export function returnQueueQuery(queue: ReturnQueue, live: boolean) {
  return queryOptions({
    queryKey: returnKeys.overview(queue),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/seller/returns', {
            params: { query: { limit: OVERVIEW_SIZE, ...QUEUE_QUERY[queue] } },
            signal,
          }),
        )
      ).data,
    refetchInterval: fallbackPoll(live),
  });
}

/** SE-19: stale 0; live on `return.updated`. */
export function returnQuery(returnId: string) {
  return queryOptions({
    queryKey: returnKeys.detail(returnId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/seller/returns/{returnId}', { params: { path: { returnId } }, signal }),
        )
      ).data,
    staleTime: 0,
  });
}

/** Not this seller's return (`RETURN_NOT_FOUND`), or the id in the URL isn't an id (`VALIDATION_FAILED`). */
export function isReturnMissing(error: unknown): boolean {
  return isApiError(error, 'RETURN_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}

const path = (returnId: string) => ({ params: { path: { returnId } } });

export async function approveReturn(returnId: string): Promise<SellerReturn> {
  return (await unwrap(browserApi.POST('/api/v1/seller/returns/{returnId}/approve', path(returnId)))).data;
}

export async function rejectReturn(returnId: string, reason: string): Promise<SellerReturn> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/seller/returns/{returnId}/reject', { ...path(returnId), body: { reason } }),
    )
  ).data;
}

export interface ConfirmReceiptInput {
  readonly returnId: string;
  readonly body: Schema<'ConfirmReceiptDto'>;
}

/** Idempotent: one key per set of restock choices (design 02 §5.4). */
export async function confirmReceipt(input: ConfirmReceiptInput, key: string): Promise<SellerReturn> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/seller/returns/{returnId}/confirm-receipt', {
        params: { path: { returnId: input.returnId }, header: { 'Idempotency-Key': key } },
        body: input.body,
      }),
    )
  ).data;
}

export async function disputeReturn(
  returnId: string,
  body: Schema<'DisputeReturnDto'>,
): Promise<SellerReturn> {
  return (
    await unwrap(browserApi.POST('/api/v1/seller/returns/{returnId}/dispute', { ...path(returnId), body }))
  ).data;
}
