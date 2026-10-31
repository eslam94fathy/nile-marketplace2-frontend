import { parseMoney } from '@nile/domain';
import { Money, NileImage } from '@nile/ui';
import type { Cart } from '@/features/cart';
import type { CouponQuote } from '../api';
import { CHECKOUT_COPY } from '../copy';

/**
 * SF-07 §3 Review: the cart's items grouped by seller, as the API returned them, with each seller's share of
 * an applied coupon (SF-07-C).
 */
export function OrderReview({ cart, quote }: { readonly cart: Cart; readonly quote: CouponQuote | null }) {
  return (
    <div className="space-y-4">
      {cart.sellers.length > 1 ? (
        <p className="text-sm text-muted-foreground">{CHECKOUT_COPY.parcels(cart.sellers.length)}</p>
      ) : null}
      {cart.sellers.map((seller) => (
        <section
          key={seller.sellerId}
          aria-label={CHECKOUT_COPY.soldBy(seller.businessName)}
          className="rounded-lg border border-border"
        >
          <h3 className="border-b border-border px-4 py-2 text-sm font-medium">
            {CHECKOUT_COPY.soldBy(seller.businessName)}
          </h3>
          <ul className="divide-y divide-border">
            {seller.items.map((item) => (
              <li key={item.id} className="flex gap-3 px-4 py-3 text-sm">
                <NileImage
                  image={item.image}
                  alt=""
                  sizes="64px"
                  placeholder="product"
                  className="size-16 shrink-0 rounded-md bg-muted"
                />
                <span className="flex-1">
                  <span className="block font-medium">{item.productName}</span>
                  {item.attributes.length === 0 ? null : (
                    <span className="block text-muted-foreground">
                      {item.attributes.map((a) => `${a.attribute}: ${a.value}`).join(' · ')}
                    </span>
                  )}
                  <span className="block text-muted-foreground">{CHECKOUT_COPY.quantity(item.quantity)}</span>
                </span>
                <Money value={item.lineTotal} />
              </li>
            ))}
          </ul>
          <SellerShare quote={quote} sellerId={seller.sellerId} />
        </section>
      ))}
    </div>
  );
}

function SellerShare({ quote, sellerId }: { readonly quote: CouponQuote | null; readonly sellerId: string }) {
  const share = quote?.sellerOrders.find((entry) => entry.sellerId === sellerId);
  if (share === undefined || parseMoney(share.discount).isZero()) return null;
  return (
    <p className="flex justify-between border-t border-border px-4 py-2 text-sm">
      <span>{CHECKOUT_COPY.coupon.sellerShare}</span>
      <Money value={share.discount} negative />
    </p>
  );
}
