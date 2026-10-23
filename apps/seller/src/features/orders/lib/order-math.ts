import type { SellerOrderStatus } from '@nile/domain';
import type { SellerOrder, SellerOrderItem } from '../api';

// Quantities on a seller order (spec 02 SE-14, SE-15). Money is never computed here: the API's subtotal,
// commission and net are shown as sent.

/** Units of a line still ordered: ordered minus cancelled. */
export const openQuantity = (item: SellerOrderItem): number => item.quantity - item.cancelledQuantity;

/** "Item count" in the list: Σ open quantities (spec 02 SE-14). */
export const openItemCount = (order: SellerOrder): number =>
  order.items.reduce((sum, item) => sum + openQuantity(item), 0);

/**
 * Cancelling `quantity` of this line leaves nothing open on the whole seller order, so the backend cancels
 * the order itself [SPEC 09 UC-OR-5]: the dialog says so first.
 */
export function cancelsWholeOrder(order: SellerOrder, itemId: string, quantity: number): boolean {
  return order.items.every(
    (item) => (item.id === itemId ? openQuantity(item) - quantity : openQuantity(item)) <= 0,
  );
}

/** No further change can come from anyone: stop polling the detail (spec 02 §6). */
const TERMINAL: readonly SellerOrderStatus[] = ['delivered', 'returned_to_seller', 'cancelled'];
export const isTerminal = (status: SellerOrderStatus): boolean => TERMINAL.includes(status);
