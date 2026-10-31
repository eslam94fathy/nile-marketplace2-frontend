import type { Metadata } from 'next';
import { REQUEST_RETURN_COPY, RequestReturn } from '@/features/returns';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: REQUEST_RETURN_COPY.title };

/** SF-26 Request a return for `?sellerOrder=<id>` of the order. */
export default async function RequestReturnPage({
  params,
  searchParams,
}: PageProps<'/account/orders/[orderId]/return'>) {
  await requireSession();
  const sellerOrder = (await searchParams).sellerOrder;
  return (
    <RequestReturn
      orderId={(await params).orderId}
      sellerOrderId={(Array.isArray(sellerOrder) ? sellerOrder[0] : sellerOrder) ?? null}
    />
  );
}
