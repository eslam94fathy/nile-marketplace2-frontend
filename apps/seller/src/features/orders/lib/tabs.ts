import type { SellerOrderStatus } from '@nile/domain';

// SE-14 tabs [PROPOSED in spec 02, accepted SE-Q-5]: the URL keeps the tab (`?tab=<key>`), the API gets
// `status[in]` and the tab's sort. No parameter (or an unknown one) is "To confirm" (decided 2026-10-15).

export const ORDER_TAB_PARAM = 'tab';

export interface OrderTab {
  readonly key: string;
  /** `status[in]` values; null for every status. */
  readonly statuses: readonly SellerOrderStatus[] | null;
  /** Work queues oldest first (nearest deadline first); history newest first. */
  readonly sort: 'createdAt' | '-createdAt';
}

export const ORDER_TABS = [
  { key: 'to-confirm', statuses: ['placed'], sort: 'createdAt' },
  { key: 'to-prepare', statuses: ['accepted'], sort: 'createdAt' },
  { key: 'awaiting-pickup', statuses: ['ready_for_pickup'], sort: 'createdAt' },
  { key: 'in-delivery', statuses: ['picked_up', 'out_for_delivery', 'delivery_failed'], sort: '-createdAt' },
  { key: 'returns', statuses: ['returning_to_seller', 'returned_to_seller'], sort: '-createdAt' },
  { key: 'delivered', statuses: ['delivered'], sort: '-createdAt' },
  { key: 'cancelled', statuses: ['cancelled'], sort: '-createdAt' },
  { key: 'all', statuses: null, sort: '-createdAt' },
] as const satisfies readonly OrderTab[];

export type OrderTabKey = (typeof ORDER_TABS)[number]['key'];

export function orderTab(param: string | null | undefined): OrderTab & { readonly key: OrderTabKey } {
  return ORDER_TABS.find((tab) => tab.key === param) ?? ORDER_TABS[0];
}
