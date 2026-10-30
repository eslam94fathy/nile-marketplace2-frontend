import { parseMoney } from '@nile/domain';
import type { ReturnReason } from '../api';

// SF-26 summary (SF-Q-19): an estimate from the API's paid unit amounts, labelled "Estimated"; once the return
// exists, its `refundAmount` is the amount shown (conventions §12.9). Decimal arithmetic, never `number`.

/** The return fee is the customer's only for "Changed my mind"; seller-fault returns are free [SPEC 18]. */
export function customerPaysFee(reason: ReturnReason | null): boolean {
  return reason === 'changed_mind';
}

export interface ReturnEstimate {
  /** Σ paid unit amount × quantity. */
  readonly itemsValue: string;
  /** The fee taken from the refund, or null when the customer doesn't pay it. */
  readonly fee: string | null;
  /** Items value minus the fee (may be ≤ 0: `RETURN_AMOUNT_TOO_LOW`). */
  readonly refund: string;
}

export function estimateRefund(
  lines: readonly { readonly paidUnitAmount: string; readonly quantity: number }[],
  returnFee: string,
  reason: ReturnReason | null,
): ReturnEstimate {
  const itemsValue = lines.reduce(
    (sum, line) => sum.plus(parseMoney(line.paidUnitAmount).times(line.quantity)),
    parseMoney('0'),
  );
  const fee = customerPaysFee(reason) ? parseMoney(returnFee) : null;
  return {
    itemsValue: itemsValue.toFixed(2),
    fee: fee === null ? null : fee.toFixed(2),
    refund: (fee === null ? itemsValue : itemsValue.minus(fee)).toFixed(2),
  };
}

/** True when the estimate leaves nothing to refund (the API would answer `RETURN_AMOUNT_TOO_LOW`). */
export function refundTooLow(estimate: ReturnEstimate): boolean {
  return parseMoney(estimate.refund).lessThanOrEqualTo(0);
}
