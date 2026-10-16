'use client';

import { unwrap } from '@nile/api';
import { queryKey } from '@nile/query';
import { queryOptions, useQueries } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { browserApi } from '@/lib/browser-api';

// Seller names on payout lists (spec 03 §2.2, AD-Q-3): one request per unique id on screen, kept 5 min.

const SELLER_NAME_STALE_MS = 5 * 60_000;

export const sellerNameKeys = {
  byId: (sellerId: string) => queryKey('admin', 'sellers', 'byId', { sellerId }),
};

function sellerNameQuery(sellerId: string) {
  return queryOptions({
    queryKey: sellerNameKeys.byId(sellerId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/sellers/{sellerId}', { params: { path: { sellerId } }, signal }),
        )
      ).data,
    staleTime: SELLER_NAME_STALE_MS,
    // A missing seller only costs the name: the short id is shown instead.
    retry: false,
  });
}

/** Seller id → business name for the ids on screen; null while unknown. */
export function useSellerNames(sellerIds: readonly (string | null)[]) {
  const unique = useMemo(
    () => [...new Set(sellerIds.filter((id): id is string => id !== null))].sort(),
    [sellerIds],
  );
  const names = useQueries({
    queries: unique.map((id) => sellerNameQuery(id)),
    combine: (results) =>
      new Map(
        results.flatMap((result) =>
          result.data === undefined ? [] : [[result.data.id, result.data.businessName]],
        ),
      ),
  });
  return useCallback((sellerId: string): string | null => names.get(sellerId) ?? null, [names]);
}
