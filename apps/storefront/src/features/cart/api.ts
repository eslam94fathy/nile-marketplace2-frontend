import { isApiError, unwrap, type Schema } from '@nile/api';
import { queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// The customer's cart (design 02 §2.2 `cart`, §3.1 mutations). The cart shown is always the last CartDto the
// API returned: add and change answer with the whole cart (set in the cache); remove and empty answer 204
// (refetch). Totals are never computed here (spec 01 SF-06 acceptance 1).

export type Cart = Schema<'CartDto'>;
export type CartSeller = Schema<'CartSellerDto'>;
export type CartLine = Schema<'CartItemDto'>;

export const cartKeys = {
  cart: () => queryKey('storefront', 'cart', 'detail'),
};

/** Never stale and refetched on focus: stock, prices and purchasability change under the customer. */
export function cartQuery() {
  return queryOptions({
    queryKey: cartKeys.cart(),
    queryFn: async ({ signal }) => (await unwrap(browserApi.GET('/api/v1/cart', { signal }))).data,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export async function addCartItem(body: Schema<'AddCartItemDto'>): Promise<Cart> {
  return (await unwrap(browserApi.POST('/api/v1/cart/items', { body }))).data;
}

export async function setCartItemQuantity(itemId: string, quantity: number): Promise<Cart> {
  return (
    await unwrap(
      browserApi.PATCH('/api/v1/cart/items/{itemId}', { params: { path: { itemId } }, body: { quantity } }),
    )
  ).data;
}

export async function removeCartItem(itemId: string): Promise<void> {
  await unwrap(browserApi.DELETE('/api/v1/cart/items/{itemId}', { params: { path: { itemId } } }));
}

export async function emptyCart(): Promise<void> {
  await unwrap(browserApi.DELETE('/api/v1/cart'));
}

/**
 * A failure that doesn't tell whether the write happened (no response, timeout, 5xx). An add is never retried
 * automatically: adds are summed and have no idempotency key [SPEC 08 CT-5]; the cart is refetched instead.
 */
export function isAmbiguousFailure(error: unknown): boolean {
  if (!isApiError(error)) return true;
  return error.code === 'NETWORK_ERROR' || error.code === 'UPSTREAM_TIMEOUT' || error.status >= 500;
}

/** `INSUFFICIENT_STOCK` details carry `available: <n>` [SPEC 08 §6]; null when absent or malformed. */
export function availableFromError(error: unknown): number | null {
  if (!isApiError(error, 'INSUFFICIENT_STOCK')) return null;
  const match = /^available: (\d+)$/.exec(error.details[0]?.message ?? '');
  return match?.[1] === undefined ? null : Number(match[1]);
}
