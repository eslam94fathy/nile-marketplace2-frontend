import type { Order } from '../api';
import { ORDERS_COPY } from '../copy';

// SF-17 status tabs [PROPOSED grouping in spec 01]: the URL keeps the tab (`?status=<key>`), the API gets
// `status[in]`. "All" has no parameter.

type OrderStatus = Order['status'];

export interface OrderTab {
  readonly key: string;
  readonly label: string;
  /** `status[in]` values; null for every status. */
  readonly statuses: readonly OrderStatus[] | null;
}

export const ORDER_TABS = [
  { key: 'all', label: ORDERS_COPY.tabs.all, statuses: null },
  { key: 'awaiting-payment', label: ORDERS_COPY.tabs.awaitingPayment, statuses: ['pending_payment'] },
  { key: 'in-progress', label: ORDERS_COPY.tabs.inProgress, statuses: ['placed', 'in_progress'] },
  { key: 'completed', label: ORDERS_COPY.tabs.completed, statuses: ['completed', 'partially_completed'] },
  { key: 'cancelled', label: ORDERS_COPY.tabs.cancelled, statuses: ['cancelled'] },
] as const satisfies readonly OrderTab[];

export type OrderTabKey = (typeof ORDER_TABS)[number]['key'];

/** Query parameter of the tab (spec 01 SF-17 route `/account/orders?status=`). */
export const ORDER_TAB_PARAM = 'status';

/** The tab named in the URL; anything unknown is "All" (invalid URL values are dropped, R-28). */
export function orderTab(param: string | null | undefined): OrderTab {
  return ORDER_TABS.find((tab) => tab.key === param) ?? ORDER_TABS[0];
}
