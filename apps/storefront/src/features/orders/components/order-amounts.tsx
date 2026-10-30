import { addMoney, formatMoney, parseMoney } from '@nile/domain';
import { Money } from '@nile/ui';
import type { Order } from '../api';
import { ORDERS_COPY as COPY } from '../copy';

type OrderItem = Order['sellerOrders'][number]['items'][number];

/**
 * An item's amount (spec 01 §10.3): what was paid for the line (`paidTotal`), with the original line total
 * struck through when a coupon took something off (`discountAmount > 0`).
 */
export function ItemAmount({ item }: { readonly item: OrderItem }) {
  if (parseMoney(item.discountAmount).isZero()) return <Money value={item.lineTotal} />;
  return (
    <span className="flex flex-col items-end">
      <Money value={item.paidTotal} />
      <span className="text-xs text-muted-foreground">
        <s aria-hidden="true">
          <Money value={item.lineTotal} />
        </s>
        <span className="sr-only">{COPY.was(formatMoney(item.lineTotal))}</span>
      </span>
    </span>
  );
}

/**
 * The order's totals (SF-08, SF-18): items, the coupon as a negative row, delivery fee, total. The API's
 * `itemsTotal` is already after the coupon [VERIFIED backend `OrderDetailDto`], so the items row adds the
 * discount back for display only (decided 2026-10-30, T-K4); the total is always the API's.
 */
export function OrderTotals({ order }: { readonly order: Order }) {
  const items =
    order.coupon === null ? order.itemsTotal : addMoney(order.itemsTotal, order.coupon.discountTotal);
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt>{COPY.itemsTotal}</dt>
        <dd>
          <Money value={items} />
        </dd>
      </div>
      {order.coupon === null ? null : (
        <div className="flex justify-between">
          <dt>{COPY.couponLine(order.coupon.code)}</dt>
          <dd>
            <Money value={order.coupon.discountTotal} negative />
          </dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt>{COPY.deliveryFee}</dt>
        <dd>
          <Money value={order.deliveryFee} />
        </dd>
      </div>
      <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
        <dt>{COPY.total}</dt>
        <dd>
          <Money value={order.total} />
        </dd>
      </div>
    </dl>
  );
}
