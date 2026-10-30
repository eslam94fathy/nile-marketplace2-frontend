import type { InvalidationMap } from '@nile/realtime';
import { orderKeys } from '@/features/orders';
import { returnKeys } from './api';

/** `return.updated` (design 02 §5.3): every return query and the order the return belongs to (SF-18 live). */
export const RETURNS_INVALIDATION = {
  'return.updated': ({ orderId }) => [returnKeys.all(), orderKeys.detail(orderId)],
} satisfies InvalidationMap;
