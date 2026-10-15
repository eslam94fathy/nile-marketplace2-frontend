'use client';

import { isApiError } from '@nile/api';
import { toast } from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { profileQuery, type SellerProfile } from './api';
import { bannerText, PROFILE_COPY } from './copy';

// What the seller's status allows (spec 02 §2.2). The UI only explains; the backend refuses with
// `SELLER_NOT_APPROVED` [SPEC 06 S-17], which `useNotApprovedHandler` turns into the same guidance.

export interface SellerAccess {
  /** Create, edit, delete and publish products and variants, and adjust stock: approved only. */
  readonly catalog: boolean;
  /** Work on orders: approved, and suspended sellers finishing their open orders [SPEC 00 Q-36]. */
  readonly orders: boolean;
  /** Why something is disabled: the banner's sentence; null while approved. */
  readonly reason: string | null;
}

export function sellerAccess(profile: Pick<SellerProfile, 'status' | 'rejectionReason'>): SellerAccess {
  if (profile.status === 'approved') return { catalog: true, orders: true, reason: null };
  return {
    catalog: false,
    orders: profile.status === 'suspended',
    reason: bannerText(profile.status, profile.rejectionReason),
  };
}

/** Nothing is allowed until the profile has loaded: controls stay disabled rather than flicker on. */
const UNKNOWN: SellerAccess = { catalog: false, orders: false, reason: null };

export function useSellerAccess(): SellerAccess {
  const { data } = useQuery(profileQuery());
  return data === undefined ? UNKNOWN : sellerAccess(data);
}

/**
 * For every write's error handler (spec 02 §2.2): on `SELLER_NOT_APPROVED` it refetches the profile (banner
 * and controls follow), toasts the banner's sentence and returns true; any other error returns false.
 */
export function useNotApprovedHandler(): (error: unknown) => boolean {
  const queryClient = useQueryClient();
  return useCallback(
    (error: unknown) => {
      if (!isApiError(error, 'SELLER_NOT_APPROVED')) return false;
      void queryClient
        .query({ ...profileQuery(), staleTime: 0 })
        .then((profile) => sellerAccess(profile).reason)
        .catch(() => null)
        .then((reason) => {
          toast({ title: reason ?? PROFILE_COPY.notApprovedFallback, tone: 'destructive' });
        });
      return true;
    },
    [queryClient],
  );
}
