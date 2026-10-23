import type { ShipmentStatus } from '@nile/domain';

// AG-04 tabs (spec 04, AG-Q-5): the URL keeps the tab (`/?tab=deliver`), the API gets `status[in]`,
// oldest first. No or unknown tab = "To pick up".

export const ACTIVE_TABS = {
  pickup: ['assigned'],
  deliver: ['picked_up', 'out_for_delivery', 'delivery_failed'],
  returns: ['returning_to_seller'],
} as const satisfies Readonly<Record<string, readonly ShipmentStatus[]>>;

export type ActiveTab = keyof typeof ACTIVE_TABS;
export const ACTIVE_TAB_PARAM = 'tab';
export const DEFAULT_ACTIVE_TAB: ActiveTab = 'pickup';

export const activeTab = (value: string | null | undefined): ActiveTab =>
  value !== null && value !== undefined && Object.hasOwn(ACTIVE_TABS, value)
    ? (value as ActiveTab)
    : DEFAULT_ACTIVE_TAB;

/** AG-06: the shipments that are over. */
export const HISTORY_STATUSES = [
  'delivered',
  'returned_to_seller',
  'cancelled',
] as const satisfies readonly ShipmentStatus[];
