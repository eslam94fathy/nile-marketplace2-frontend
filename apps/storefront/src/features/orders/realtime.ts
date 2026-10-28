import type { InvalidationMap } from '@nile/realtime';
import { orderKeys } from './api';

/** What each order message makes stale for the customer (design 02 §5.3). */
export const ORDERS_INVALIDATION = {
  'order.updated': ({ orderId }) => [orderKeys.lists(), orderKeys.detail(orderId), orderKeys.latestOpen()],
  'seller_order.updated': ({ orderId }) => [orderKeys.detail(orderId), orderKeys.lists()],
  'shipment.updated': ({ orderId }) => [orderKeys.detail(orderId)],
  'payment.updated': ({ orderId }) => [orderKeys.detail(orderId), orderKeys.lists(), orderKeys.latestOpen()],
} satisfies InvalidationMap;
