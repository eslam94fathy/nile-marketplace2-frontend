import { unwrap, type Schema } from '@nile/api';
import { queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// The seller's profile and status (design 02 §2.3 `profile`): header, status banner, SE-06 and SE-07.

const PROFILE_STALE_TIME_MS = 60_000;

export type SellerProfile = Schema<'SellerProfileDto'>;
export type SellerProfilePatch = Schema<'UpdateSellerProfileDto'>;

export const profileKeys = {
  profile: () => queryKey('seller', 'profile', 'detail'),
};

/** Loaded once per page and on focus (spec 02 §2.2): the status decides what the seller can do. */
export function profileQuery() {
  return queryOptions({
    queryKey: profileKeys.profile(),
    queryFn: async () => (await unwrap(browserApi.GET('/api/v1/seller/profile'))).data,
    staleTime: PROFILE_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });
}

/** SE-07-A1: allowed in any status, no re-approval [SPEC 05 S-7]. */
export async function updateProfile(body: SellerProfilePatch): Promise<SellerProfile> {
  return (await unwrap(browserApi.PATCH('/api/v1/seller/profile', { body }))).data;
}

/** SE-07-A2: `rejected` → `pending_approval` [SPEC 05 UC-SE-2]. */
export async function reapply(): Promise<SellerProfile> {
  return (await unwrap(browserApi.POST('/api/v1/seller/profile/reapply'))).data;
}
