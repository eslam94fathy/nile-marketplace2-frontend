import { SELLER_ORDER_STATUS_LABELS } from '@nile/domain';
import { Money } from '@nile/ui';
import { useId } from 'react';
import { addressLines } from '@/features/addresses';
import type { Order } from '@/features/orders';
import { CHECKOUT_COPY } from '../copy';

/** An order's parcels (seller, status, items) and its delivery address, as `GET /orders/{id}` returns them. */
export function OrderSummaryBlocks({ order: data }: { readonly order: Order }) {
  const addressId = useId();
  const address = data.shippingAddress;
  const lines = addressLines(address, address.governorateName);
  return (
    <>
      {data.sellerOrders.map((sellerOrder) => (
        <section
          key={sellerOrder.id}
          aria-label={CHECKOUT_COPY.soldBy(sellerOrder.businessName)}
          className="rounded-lg border border-border"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
            <h2 className="text-sm font-medium">{CHECKOUT_COPY.soldBy(sellerOrder.businessName)}</h2>
            <span className="text-sm text-muted-foreground">
              {SELLER_ORDER_STATUS_LABELS.customer[sellerOrder.status]}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {sellerOrder.items.map((item) => (
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
      <section aria-labelledby={addressId} className="space-y-1 text-sm">
        <h2 id={addressId} className="font-medium">
          {CHECKOUT_COPY.confirmation.addressHeading}
        </h2>
        <p>
          {address.recipientName} · {address.recipientPhone}
        </p>
        <p className="text-muted-foreground">{lines.main}</p>
        {lines.extra === null ? null : <p className="text-muted-foreground">{lines.extra}</p>}
      </section>
    </>
  );
}
