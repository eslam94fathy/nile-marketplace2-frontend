import { unwrap, type Schema } from '@nile/api';
import { queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// The customer's orders (design 02 §2.2 `orders`). T-F3 needs the detail for the confirmation page (SF-08);
// the list, filters and polling come with T-G3 and T-F4.

export type Order = Schema<'OrderDetailDto'>;

export const orderKeys = {
  /** Prefix of every list (filters come with T-G3). */
  lists: () => queryKey('storefront', 'orders', 'list'),
  detail: (orderId: string) => queryKey('storefront', 'orders', 'detail', { orderId }),
};

/** Never stale: the order moves on as sellers, agents and payments act on it. */
export function orderQuery(orderId: string) {
  return queryOptions({
    queryKey: orderKeys.detail(orderId),
    queryFn: async ({ signal }) =>
      (await unwrap(browserApi.GET('/api/v1/orders/{orderId}', { params: { path: { orderId } }, signal })))
        .data,
    staleTime: 0,
  });
}
