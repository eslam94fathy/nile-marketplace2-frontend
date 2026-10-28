import type { InvalidationMap } from '@nile/realtime';
import { orderKeys } from './api';

/** What each order message makes stale for the seller, the overview queues included (design 02 §5.3). */
export const ORDERS_INVALIDATION = {
  'seller_order.placed': () => [orderKeys.lists(), orderKeys.overview()],
  'seller_order.updated': ({ sellerOrderId }) => [
    orderKeys.lists(),
    orderKeys.detail(sellerOrderId),
    orderKeys.overview(),
  ],
} satisfies InvalidationMap;
