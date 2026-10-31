'use client';

import { useQueries } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { productQuery } from './api';

// Product names on review lists (AD-30): `AdminReviewDto` carries only the product id, so each unique id on
// screen is read once and kept 5 min (the AD-Q-3 rule for names), in the same cache entry as AD-27.

const PRODUCT_NAME_STALE_MS = 5 * 60_000;

/** Product id → name for the ids on screen; null while unknown (or when the product can't be read). */
export function useProductNames(productIds: readonly (string | null)[]) {
  const unique = useMemo(
    () => [...new Set(productIds.filter((id): id is string => id !== null))].sort(),
    [productIds],
  );
  const names = useQueries({
    queries: unique.map((id) => ({ ...productQuery(id), staleTime: PRODUCT_NAME_STALE_MS, retry: false })),
    combine: (results) =>
      new Map(
        results.flatMap((result) => (result.data === undefined ? [] : [[result.data.id, result.data.name]])),
      ),
  });
  return useCallback((productId: string): string | null => names.get(productId) ?? null, [names]);
}
