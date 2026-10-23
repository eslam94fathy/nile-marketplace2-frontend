import { inValues } from '@nile/api';
import { cairoDayBounds, isCalendarDay, type ShipmentStatus } from '@nile/domain';
import { z } from 'zod';

// AD-12 filters, URL ⇄ API: `?status=<tab>&agent=&order=&from=&to=`. Invalid values are dropped, never sent
// (R-28). No tab is "Unassigned", the work queue, oldest first (spec 03 AD-12); the others newest first.

export const SHIPMENT_LIST_PARAMS = {
  status: 'status',
  agent: 'agent',
  order: 'order',
  from: 'from',
  to: 'to',
} as const;

/** Spec 03 AD-12 tabs, in order, with the statuses each one lists (null = every status). */
export const SHIPMENT_TABS = {
  unassigned: ['unassigned'],
  assigned: ['assigned'],
  'in-delivery': ['picked_up', 'out_for_delivery', 'delivery_failed'],
  returning: ['returning_to_seller'],
  delivered: ['delivered'],
  returned: ['returned_to_seller'],
  cancelled: ['cancelled'],
  all: null,
} as const satisfies Readonly<Record<string, readonly ShipmentStatus[] | null>>;

export type ShipmentTab = keyof typeof SHIPMENT_TABS;
export const DEFAULT_SHIPMENT_TAB: ShipmentTab = 'unassigned';

/** An agent's open work [VERIFIED backend `ACTIVE_SHIPMENT_STATUSES`], for AD-11. */
export const ACTIVE_SHIPMENT_STATUSES = [
  'assigned',
  'picked_up',
  'out_for_delivery',
  'delivery_failed',
  'returning_to_seller',
] as const satisfies readonly ShipmentStatus[];

export interface ShipmentFilters {
  readonly tab: ShipmentTab;
  readonly agentId: string | null;
  readonly orderId: string | null;
  /** Cairo calendar days `YYYY-MM-DD`, inclusive. */
  readonly from: string | null;
  readonly to: string | null;
}

export type RawShipmentParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const uuid = (value: string | undefined) => (z.uuid().safeParse(value).success ? (value ?? null) : null);
const day = (value: string | undefined) => (value !== undefined && isCalendarDay(value) ? value : null);
const isTab = (value: string | undefined): value is ShipmentTab =>
  value !== undefined && Object.hasOwn(SHIPMENT_TABS, value);

export function parseShipmentFilters(params: RawShipmentParams): ShipmentFilters {
  const tab = single(params[SHIPMENT_LIST_PARAMS.status]);
  const from = day(single(params[SHIPMENT_LIST_PARAMS.from]));
  const to = day(single(params[SHIPMENT_LIST_PARAMS.to]));
  return {
    tab: isTab(tab) ? tab : DEFAULT_SHIPMENT_TAB,
    agentId: uuid(single(params[SHIPMENT_LIST_PARAMS.agent])),
    orderId: uuid(single(params[SHIPMENT_LIST_PARAMS.order])),
    from,
    // A range that ends before it starts is dropped as a whole end.
    to: from !== null && to !== null && to < from ? null : to,
  };
}

/** The query string for filters (no `?`): the default Unassigned tab has no `status`. */
export function shipmentFiltersQuery(filters: ShipmentFilters): string {
  const query = new URLSearchParams();
  if (filters.tab !== DEFAULT_SHIPMENT_TAB) query.set(SHIPMENT_LIST_PARAMS.status, filters.tab);
  if (filters.agentId !== null) query.set(SHIPMENT_LIST_PARAMS.agent, filters.agentId);
  if (filters.orderId !== null) query.set(SHIPMENT_LIST_PARAMS.order, filters.orderId);
  if (filters.from !== null) query.set(SHIPMENT_LIST_PARAMS.from, filters.from);
  if (filters.to !== null) query.set(SHIPMENT_LIST_PARAMS.to, filters.to);
  return query.toString();
}

/** A status filter as the API takes it: one value with `[eq]`, several with `[in]`. */
export function statusQuery(statuses: readonly ShipmentStatus[] | null) {
  if (statuses === null) return {};
  const [first] = statuses;
  return statuses.length === 1 && first !== undefined
    ? { 'status[eq]': first }
    : { 'status[in]': inValues(statuses) };
}

/** The API query (literal filter keys). */
export function shipmentApiQuery(filters: ShipmentFilters) {
  return {
    sort: filters.tab === 'unassigned' ? ('createdAt' as const) : ('-createdAt' as const),
    ...statusQuery(SHIPMENT_TABS[filters.tab]),
    ...(filters.agentId === null ? {} : { 'agentId[eq]': filters.agentId }),
    ...(filters.orderId === null ? {} : { 'orderId[eq]': filters.orderId }),
    ...(filters.from === null ? {} : { 'createdAt[gte]': cairoDayBounds(filters.from).start }),
    ...(filters.to === null ? {} : { 'createdAt[lte]': cairoDayBounds(filters.to).end }),
  };
}

export const hasNarrowingFilters = (filters: ShipmentFilters): boolean =>
  filters.agentId !== null || filters.orderId !== null || filters.from !== null || filters.to !== null;
