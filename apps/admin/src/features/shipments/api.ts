import { isApiError, unwrap, type paths, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import {
  ACTIVE_SHIPMENT_STATUSES,
  shipmentApiQuery,
  statusQuery,
  type ShipmentFilters,
} from './lib/list-params';

// Shipments (spec 03 AD-11, AD-12, AD-13; design 02 §2.4 `shipments.*`, §3.4 "Assign shipment").

export type AdminShipment = Schema<'AdminShipmentDto'>;

const SHIPMENTS_PAGE_SIZE = 20;

export const shipmentKeys = {
  lists: () => queryKey('admin', 'shipments', 'list'),
  list: (filters: ShipmentFilters) => queryKey('admin', 'shipments', 'list', filters),
  agentActive: (agentId: string) => queryKey('admin', 'shipments', 'list', { agentId, active: true }),
  detail: (shipmentId: string) => queryKey('admin', 'shipments', 'detail', { shipmentId }),
  dashboard: () => queryKey('admin', 'dashboard', 'unassignedShipments'),
};

type ShipmentsQuery = Omit<
  NonNullable<paths['/api/v1/admin/shipments']['get']['parameters']['query']>,
  'limit' | 'cursor'
>;

const fetchPage = (query: ShipmentsQuery, cursor: string | undefined, signal: AbortSignal) =>
  unwrap(
    browserApi.GET('/api/v1/admin/shipments', {
      params: {
        query: { limit: SHIPMENTS_PAGE_SIZE, ...query, ...(cursor === undefined ? {} : { cursor }) },
      },
      signal,
    }),
  );

/** AD-12. */
export function shipmentsListOptions(filters: ShipmentFilters) {
  return infiniteListOptions({
    queryKey: shipmentKeys.list(filters),
    fetchPage: (cursor, signal) => fetchPage(shipmentApiQuery(filters), cursor, signal),
  });
}

/** AD-11: the agent's open work, newest first. */
export function agentActiveShipmentsOptions(agentId: string) {
  return infiniteListOptions({
    queryKey: shipmentKeys.agentActive(agentId),
    fetchPage: (cursor, signal) =>
      fetchPage(
        { sort: '-createdAt', 'agentId[eq]': agentId, ...statusQuery(ACTIVE_SHIPMENT_STATUSES) },
        cursor,
        signal,
      ),
  });
}

/** AD-13: stale 0 (design 02 §2.4). */
export function shipmentQuery(shipmentId: string) {
  return queryOptions({
    queryKey: shipmentKeys.detail(shipmentId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/shipments/{shipmentId}', {
            params: { path: { shipmentId } },
            signal,
          }),
        )
      ).data,
    staleTime: 0,
  });
}

/** No such shipment, or not a shipment id at all (the backend checks the id format first, as R-36). */
export function isShipmentMissing(error: unknown): boolean {
  return isApiError(error, 'SHIPMENT_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}

export async function assignShipment(shipmentId: string, agentId: string): Promise<AdminShipment> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/shipments/{shipmentId}/assign', {
        params: { path: { shipmentId } },
        body: { agentId },
      }),
    )
  ).data;
}
