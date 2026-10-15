import { isApiError } from '@nile/api';
import type { Order } from '../api';

/** One item to add again: the open quantity of an order item (spec 01 SF-18-A3). */
export interface BuyAgainItem {
  readonly id: string;
  readonly variantId: string;
  readonly productName: string;
  readonly quantity: number;
}

export type BuyAgainOutcome =
  | 'added'
  | 'VARIANT_NOT_PURCHASABLE'
  | 'INSUFFICIENT_STOCK'
  | 'CART_ITEM_QUANTITY_LIMIT'
  | 'CART_LINE_LIMIT_REACHED'
  /** Not tried: the cart filled up on an earlier item. */
  | 'skipped'
  /** Any other refusal. */
  | 'failed';

export interface BuyAgainResult {
  readonly items: readonly { item: BuyAgainItem; outcome: BuyAgainOutcome }[];
  /** The run stopped on a failure that doesn't say whether the add happened (network, 5xx). */
  readonly interrupted: boolean;
}

const KNOWN_REFUSALS = [
  'VARIANT_NOT_PURCHASABLE',
  'INSUFFICIENT_STOCK',
  'CART_ITEM_QUANTITY_LIMIT',
  'CART_LINE_LIMIT_REACHED',
] as const;

/** Items with an open quantity (`quantity − cancelledQuantity > 0`), in the order's order. */
export function buyAgainItems(order: Order): BuyAgainItem[] {
  return order.sellerOrders.flatMap((sellerOrder) =>
    sellerOrder.items
      .map((item) => ({
        id: item.id,
        variantId: item.variantId,
        productName: item.productName,
        quantity: item.quantity - item.cancelledQuantity,
      }))
      .filter((item) => item.quantity > 0),
  );
}

/**
 * Adds the items one at a time, never in parallel and never retried (adds are summed, no idempotency key
 * [SPEC 08 CT-5]). After `CART_LINE_LIMIT_REACHED` the rest are skipped; an ambiguous failure stops the run.
 */
export async function runBuyAgain(
  items: readonly BuyAgainItem[],
  add: (item: BuyAgainItem) => Promise<unknown>,
  isAmbiguous: (error: unknown) => boolean,
): Promise<BuyAgainResult> {
  const results: { item: BuyAgainItem; outcome: BuyAgainOutcome }[] = [];
  let full = false;
  for (const item of items) {
    if (full) {
      results.push({ item, outcome: 'skipped' });
      continue;
    }
    try {
      await add(item);
      results.push({ item, outcome: 'added' });
    } catch (error) {
      if (isAmbiguous(error)) return { items: results, interrupted: true };
      const code = KNOWN_REFUSALS.find((known) => isApiError(error, known));
      results.push({ item, outcome: code ?? 'failed' });
      if (code === 'CART_LINE_LIMIT_REACHED') full = true;
    }
  }
  return { items: results, interrupted: false };
}
