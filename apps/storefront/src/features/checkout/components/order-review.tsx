import { Money } from '@nile/ui';
import type { Cart } from '@/features/cart';
import { CHECKOUT_COPY } from '../copy';

/** SF-07 §3 Review: the cart's items grouped by seller, as the API returned them. */
export function OrderReview({ cart }: { readonly cart: Cart }) {
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
              <li key={item.id} className="flex justify-between gap-4 px-4 py-3 text-sm">
                <span>
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
        </section>
      ))}
    </div>
  );
}
