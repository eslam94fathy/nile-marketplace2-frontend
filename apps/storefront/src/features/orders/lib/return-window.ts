import type { Order } from '../api';

// When SF-18 offers "Return items" (SF-Q-18): a delivered parcel whose delivery is within the return window.
// SF-26 (the API) is authoritative; this only avoids offering an action that would certainly be refused. The
// clock is read by `usePassed`, not here.

/** Kept equal to the backend's `RETURN_WINDOW_DAYS` [SPEC 18], like the 15-minute payment window (SF-Q-5). */
export const RETURN_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

type SellerOrder = Order['sellerOrders'][number];

/** The parcel's delivery time from its history, or null. */
export function deliveredAt(sellerOrder: SellerOrder): string | null {
  return sellerOrder.timeline.findLast((entry) => entry.status === 'delivered')?.at ?? null;
}

/** When the return window ends (delivery + 14 days), or null without a delivery time. */
export function returnWindowEnd(sellerOrder: SellerOrder): Date | null {
  const at = deliveredAt(sellerOrder);
  return at === null ? null : new Date(Date.parse(at) + RETURN_WINDOW_DAYS * DAY_MS);
}
