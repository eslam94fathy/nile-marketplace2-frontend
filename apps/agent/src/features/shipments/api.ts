import { inValues, isApiError, unwrap, type Schema } from '@nile/api';
import { cairoDayBounds, type ShipmentKind } from '@nile/domain';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import { HISTORY_STATUSES, tabStreams, type ActiveTab } from './lib/tabs';

// The agent's shipments (spec 04 AG-04…AG-06; design 02 §2.5 `shipments.*`, §3.4). The API scopes every read
// to the signed-in agent.

export type AgentShipment = Schema<'AgentShipmentDto'>;
export type FailedAttemptBody = Schema<'FailedAttemptDto'>;

const PAGE_SIZE = 20;
/** Spec 04 §5 and api-inventory §10.4: the active lists poll every 30 s while the app is visible. */
export const ACTIVE_POLL_MS = 30_000;

export interface HistoryFilters {
  /** Cairo calendar days `YYYY-MM-DD`, inclusive. */
  readonly from: string | null;
  readonly to: string | null;
  /** AG-06 kind chips (spec 04 §7.3); `null` = both. */
  readonly kind: ShipmentKind | null;
}

export const shipmentKeys = {
  active: () => queryKey('agent', 'shipments', 'active'),
  activeTab: (tab: ActiveTab, stream: number) => queryKey('agent', 'shipments', 'active', { tab, stream }),
  detail: (shipmentId: string) => queryKey('agent', 'shipments', 'detail', { shipmentId }),
  history: () => queryKey('agent', 'shipments', 'history'),
  historyRange: (filters: HistoryFilters) => queryKey('agent', 'shipments', 'history', filters),
};

const cursorOf = (cursor: string | undefined) => (cursor === undefined ? {} : { cursor });

/**
 * AG-04: one stream of a tab (most tabs have one), oldest first, polled while visible (TanStack pauses intervals
 * in the background).
 */
export function activeShipmentsOptions(tab: ActiveTab, stream: number, live: boolean) {
  const refetchInterval: number | false = live ? false : ACTIVE_POLL_MS;
  const spec = tabStreams(tab)[stream];
  return {
    ...infiniteListOptions({
      queryKey: shipmentKeys.activeTab(tab, stream),
      fetchPage: (cursor, signal) =>
        unwrap(
          browserApi.GET('/api/v1/agent/shipments', {
            params: {
              query: {
                limit: PAGE_SIZE,
                sort: 'createdAt',
                'status[in]': inValues(spec?.statuses ?? []),
                ...(spec?.kind === undefined ? {} : { 'kind[eq]': spec.kind }),
                ...cursorOf(cursor),
              },
            },
            signal,
          }),
        ),
    }),
    // Fallback only: shipment messages refresh the lists while a socket is connected (design 01 §15.3).
    refetchInterval,
    refetchOnWindowFocus: true,
  };
}

/** AG-06: finished shipments, newest first, with an optional Cairo-day range and kind. */
export function historyOptions(range: HistoryFilters) {
  return infiniteListOptions({
    queryKey: shipmentKeys.historyRange(range),
    fetchPage: (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/agent/shipments', {
          params: {
            query: {
              limit: PAGE_SIZE,
              sort: '-createdAt',
              'status[in]': inValues(HISTORY_STATUSES),
              ...(range.from === null ? {} : { 'createdAt[gte]': cairoDayBounds(range.from).start }),
              ...(range.to === null ? {} : { 'createdAt[lte]': cairoDayBounds(range.to).end }),
              ...(range.kind === null ? {} : { 'kind[eq]': range.kind }),
              ...cursorOf(cursor),
            },
          },
          signal,
        }),
      ),
  });
}

/** AG-05: stale 0, read again on focus (design 02 §2.5). */
export function shipmentQuery(shipmentId: string) {
  return queryOptions({
    queryKey: shipmentKeys.detail(shipmentId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/agent/shipments/{shipmentId}', {
            params: { path: { shipmentId } },
            signal,
          }),
        )
      ).data,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/**
 * Not (or no longer) this agent's: missing and reassigned look the same [SPEC 11]. A malformed id is
 * refused by the id check first (as R-36).
 */
export function isShipmentGone(error: unknown): boolean {
  return isApiError(error, 'SHIPMENT_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}

const path = (shipmentId: string) => ({ path: { shipmentId } });

/** A1, and R1 for a return pickup (collected from the customer): state-guarded, no idempotency key [SPEC 11]. */
export async function markPickedUp(shipmentId: string): Promise<AgentShipment> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/agent/shipments/{shipmentId}/picked-up', { params: path(shipmentId) }),
    )
  ).data;
}

/** A2: state-guarded, no idempotency key [SPEC 11]. */
export async function startDelivery(shipmentId: string): Promise<AgentShipment> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/agent/shipments/{shipmentId}/out-for-delivery', { params: path(shipmentId) }),
    )
  ).data;
}

export interface DeliveredInput {
  readonly shipmentId: string;
  /** COD: the API's current `amountToCollect`; card: absent (an amount would be refused). */
  readonly codCollectedAmount: string | null;
}

/** A3, and R3 for a return pickup (handed to the seller, no amount), with an `Idempotency-Key` per intent. */
export async function markDelivered(input: DeliveredInput, idempotencyKey: string): Promise<AgentShipment> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/agent/shipments/{shipmentId}/delivered', {
        params: { ...path(input.shipmentId), header: { 'Idempotency-Key': idempotencyKey } },
        body: input.codCollectedAmount === null ? {} : { codCollectedAmount: input.codCollectedAmount },
      }),
    )
  ).data;
}

export interface FailedAttemptInput {
  readonly shipmentId: string;
  readonly body: FailedAttemptBody;
}

/** A4, and R2 for a return pickup (a failed pickup), with an `Idempotency-Key` per intent. */
export async function reportFailedAttempt(
  input: FailedAttemptInput,
  idempotencyKey: string,
): Promise<AgentShipment> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/agent/shipments/{shipmentId}/failed-attempt', {
        params: { ...path(input.shipmentId), header: { 'Idempotency-Key': idempotencyKey } },
        body: input.body,
      }),
    )
  ).data;
}

/** A5, with an `Idempotency-Key` per intent. */
export async function markReturned(shipmentId: string, idempotencyKey: string): Promise<AgentShipment> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/agent/shipments/{shipmentId}/returned', {
        params: { ...path(shipmentId), header: { 'Idempotency-Key': idempotencyKey } },
      }),
    )
  ).data;
}
