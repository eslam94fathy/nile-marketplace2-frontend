import type { ShipmentKind, ShipmentStatus } from '@nile/domain';

// AG-04 tabs (spec 04 AG-Q-5, AG-Q-7): the URL keeps the tab (`/?tab=deliver`), the API gets one request per
// stream, oldest first. Return pickups share the tabs by what the agent does next. No or unknown tab = "To pick up".

export interface ActiveStream {
  readonly statuses: readonly ShipmentStatus[];
  /** Absent: both kinds. */
  readonly kind?: ShipmentKind;
}

export const ACTIVE_TABS = {
  /** Both kinds: a delivery at the seller, a return at the customer (also after a failed pickup). */
  pickup: [{ statuses: ['assigned', 'pickup_failed'] }],
  deliver: [{ kind: 'delivery', statuses: ['picked_up', 'out_for_delivery', 'delivery_failed'] }],
  /**
   * Failed deliveries going back, and collected return pickups: no single query selects both (a delivery that
   * is `picked_up` belongs to "To deliver"). Spec 04 §7.3 merges the two by `createdAt`, but
   * `AgentShipmentDto` has no `createdAt`, so they are two sections, each paged on its own (TN1-Q1).
   */
  seller: [{ statuses: ['returning_to_seller'] }, { kind: 'return', statuses: ['picked_up'] }],
} as const satisfies Readonly<Record<string, readonly ActiveStream[]>>;

export type ActiveTab = keyof typeof ACTIVE_TABS;
export const ACTIVE_TAB_PARAM = 'tab';
export const DEFAULT_ACTIVE_TAB: ActiveTab = 'pickup';

export const activeTab = (value: string | null | undefined): ActiveTab =>
  value !== null && value !== undefined && Object.hasOwn(ACTIVE_TABS, value)
    ? (value as ActiveTab)
    : DEFAULT_ACTIVE_TAB;

/** AG-06: the shipments that are over (a return pickup ends `delivered` or `cancelled`). */
export const HISTORY_STATUSES = [
  'delivered',
  'returned_to_seller',
  'cancelled',
] as const satisfies readonly ShipmentStatus[];

/** AG-06 kind chips (spec 04 §7.3): `?kind=delivery|return`, none = all. */
export const HISTORY_KIND_PARAM = 'kind';

/** A tab's streams, widened for lookups by index. */
export const tabStreams = (tab: ActiveTab): readonly ActiveStream[] => ACTIVE_TABS[tab];
