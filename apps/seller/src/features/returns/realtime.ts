import type { InvalidationMap } from '@nile/realtime';
import { financeKeys } from '@/features/finance';
import { orderKeys } from '@/features/orders';
import { returnKeys } from './api';

/**
 * `return.updated` (design 02 §5.3): the seller's returns (lists, detail, overview queues), the return's seller
 * order (returned quantities and sums) and finance (holds, balance). One entry per message type, so this map
 * owns every key the message touches.
 */
export const RETURNS_INVALIDATION = {
  'return.updated': ({ sellerOrderId }) => [
    returnKeys.all(),
    orderKeys.detail(sellerOrderId),
    financeKeys.balance(),
    financeKeys.holds(),
    financeKeys.entries(),
  ],
} satisfies InvalidationMap;
