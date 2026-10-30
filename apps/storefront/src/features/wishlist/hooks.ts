'use client';

import { isApiError } from '@nile/api';
import { defaultErrorMessage } from '@nile/domain';
import { toast } from '@nile/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import { useHasSession } from '@/lib/use-has-session';
import { retryOnceOnNetworkError, setWishlisted, wishlistIdsQuery, wishlistKeys } from './api';
import { WISHLIST_COPY } from './copy';

/** The saved product ids for the hearts; empty (and not read) while signed out. */
export function useWishlistIds(): { readonly ids: ReadonlySet<string>; readonly ready: boolean } {
  const signedIn = useHasSession();
  const query = useQuery({ ...wishlistIdsQuery(browserApi), enabled: signedIn });
  return { ids: new Set(query.data ?? []), ready: signedIn && query.isSuccess };
}

/** The toast for a refused or failed save / remove (SF-23-A1). */
export function wishlistErrorMessage(error: unknown): string {
  if (isApiError(error, 'WISHLIST_LIMIT_REACHED')) return WISHLIST_COPY.full;
  if (isApiError(error, 'PRODUCT_NOT_FOUND')) return WISHLIST_COPY.productGone;
  return defaultErrorMessage(isApiError(error) ? error.code : 'NETWORK_ERROR');
}

export interface WishlistChange {
  readonly productId: string;
  readonly saved: boolean;
}

/**
 * Save / remove with an optimistic heart (SF-23-A1): the ids change at once, a failure puts them back and says
 * why. Afterwards the ids hold what the server answered and the wishlist page is read again.
 */
export function useWishlistToggle(options: { readonly onSaved?: () => void } = {}) {
  const client = useQueryClient();
  const idsKey = wishlistKeys.ids();
  return useMutation({
    mutationFn: ({ productId, saved }: WishlistChange) => setWishlisted(browserApi, productId, saved),
    retry: retryOnceOnNetworkError,
    onMutate: async ({ productId, saved }) => {
      await client.cancelQueries({ queryKey: idsKey });
      const previous = client.getQueryData<string[]>(idsKey);
      client.setQueryData<string[]>(idsKey, (ids = []) =>
        saved ? [...ids.filter((id) => id !== productId), productId] : ids.filter((id) => id !== productId),
      );
      return { previous };
    },
    onError: (error, _change, context) => {
      client.setQueryData(idsKey, context?.previous);
      toast({ title: wishlistErrorMessage(error), tone: 'destructive' });
    },
    onSuccess: (_data, { saved }) => {
      if (saved) options.onSaved?.();
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: wishlistKeys.list() });
    },
  });
}
