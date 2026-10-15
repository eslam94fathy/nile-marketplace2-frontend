'use client';

import type { Schema } from '@nile/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useHasSession } from '@/lib/use-has-session';
import {
  addCartItem,
  cartKeys,
  cartQuery,
  emptyCart,
  isAmbiguousFailure,
  removeCartItem,
  setCartItemQuantity,
  type Cart,
} from './api';

/** The cart, only when this browser has a session (visitors have no cart, FQ-6). */
export function useCart() {
  return useQuery({ ...cartQuery(), enabled: useHasSession() });
}

/**
 * Add to cart (spec 01 SF-05-A1). Success replaces the cached cart with the response. An ambiguous failure
 * refetches the cart instead of retrying (adds are summed, no idempotency key [SPEC 08 CT-5]).
 */
export function useAddToCart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Schema<'AddCartItemDto'>) => addCartItem(body),
    onSuccess: (cart) => {
      queryClient.setQueryData<Cart>(cartKeys.cart(), cart);
    },
    onError: (error) => {
      if (isAmbiguousFailure(error)) void queryClient.invalidateQueries({ queryKey: cartKeys.cart() });
    },
  });
}

/**
 * Cart page actions (spec 01 SF-06). A quantity change answers with the cart (set in the cache); remove and
 * empty answer 204 (refetch). Any failure refetches, so the page shows the cart as it really is.
 */
export function useCartActions() {
  const queryClient = useQueryClient();
  const refetch = () => queryClient.invalidateQueries({ queryKey: cartKeys.cart() });
  const setQuantity = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      setCartItemQuantity(itemId, quantity),
    onSuccess: (cart) => {
      queryClient.setQueryData<Cart>(cartKeys.cart(), cart);
    },
    onError: () => void refetch(),
  });
  const remove = useMutation({
    mutationFn: (itemId: string) => removeCartItem(itemId),
    onSettled: () => refetch(),
  });
  const empty = useMutation({
    mutationFn: () => emptyCart(),
    onSettled: () => refetch(),
  });
  return { setQuantity, remove, empty };
}
