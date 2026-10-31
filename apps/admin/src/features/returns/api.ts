import { isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import { returnApiQuery, type ReturnFilters } from './lib/list-params';

// Returns (spec 03 AD-32, AD-33; design 02 §5.2 `returns.list` / `.detail`, §5.4 decide / resolve dispute).

export type AdminReturn = Schema<'AdminReturnDto'>;
export type ReturnDecision = Schema<'AdminDecideReturnDto'>['decision'];
export type DisputeDecision = Schema<'ResolveDisputeDto'>['decision'];

const RETURNS_PAGE_SIZE = 20;
/** One order has at most a few return shipments; one page reads them all. */
const RETURN_SHIPMENTS_LIMIT = 50;

export const returnKeys = {
  /** Every returns key: `return.updated` refreshes them all. */
  all: () => ['admin', 'returns'] as const,
  lists: () => queryKey('admin', 'returns', 'list'),
  list: (filters: ReturnFilters) => queryKey('admin', 'returns', 'list', filters),
  detail: (returnId: string) => queryKey('admin', 'returns', 'detail', { returnId }),
  shipment: (returnId: string, orderId: string) =>
    queryKey('admin', 'returns', 'shipment', { returnId, orderId }),
};

export function returnsListOptions(filters: ReturnFilters) {
  return infiniteListOptions({
    queryKey: returnKeys.list(filters),
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/returns', {
          params: {
            query: {
              limit: RETURNS_PAGE_SIZE,
              ...returnApiQuery(filters),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}

/** AD-33: stale 0; `return.updated` and every decision read it again. */
export function returnQuery(returnId: string) {
  return queryOptions({
    queryKey: returnKeys.detail(returnId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/returns/{returnId}', { params: { path: { returnId } }, signal }),
        )
      ).data,
    staleTime: 0,
  });
}

/**
 * AD-33 "Return shipment": `AdminReturnDto` has no shipment id and shipments have no return filter, so the
 * order's return shipments are read and matched on `returnId` (TM7-Q2). `null` when none exists yet.
 */
export function returnShipmentQuery(item: Pick<AdminReturn, 'id' | 'orderId'>) {
  return queryOptions({
    queryKey: returnKeys.shipment(item.id, item.orderId),
    queryFn: async ({ signal }) => {
      const shipments = (
        await unwrap(
          browserApi.GET('/api/v1/admin/shipments', {
            params: {
              query: {
                limit: RETURN_SHIPMENTS_LIMIT,
                sort: '-createdAt',
                'orderId[eq]': item.orderId,
                'kind[eq]': 'return',
              },
            },
            signal,
          }),
        )
      ).data;
      return shipments.find((shipment) => shipment.returnId === item.id) ?? null;
    },
    staleTime: 0,
  });
}

/** No such return, or not a return id at all (the backend checks the id format first, as R-36). */
export function isReturnMissing(error: unknown): boolean {
  return isApiError(error, 'RETURN_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}

/** `requested` or `escalated` (spec 03 AD-33): the answer is the return after the decision. */
export async function decideReturn(input: {
  readonly returnId: string;
  readonly decision: ReturnDecision;
  readonly note: string;
}): Promise<AdminReturn> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/returns/{returnId}/decide', {
        params: { path: { returnId: input.returnId } },
        body: { decision: input.decision, note: input.note },
      }),
    )
  ).data;
}

export interface ResolveDisputeInput {
  readonly returnId: string;
  readonly decision: DisputeDecision;
  readonly note: string;
}

/** `disputed` (spec 03 AD-33): one `Idempotency-Key` per intent (decision + note). */
export async function resolveDispute(
  input: ResolveDisputeInput,
  idempotencyKey: string,
): Promise<AdminReturn> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/returns/{returnId}/resolve-dispute', {
        params: { path: { returnId: input.returnId }, header: { 'Idempotency-Key': idempotencyKey } },
        body: { decision: input.decision, note: input.note },
      }),
    )
  ).data;
}
