import { addMoney } from '@nile/domain';

/**
 * The total shown to the shopper and sent as `expectedTotal` (spec 01 SF-07 §3, OQ-15): the cart's items
 * total plus the chosen governorate's delivery fee, in exact decimal arithmetic. Null until both are known.
 */
export function expectedTotal(itemsTotal: string, deliveryFee: string | null): string | null {
  return deliveryFee === null ? null : addMoney(itemsTotal, deliveryFee);
}
