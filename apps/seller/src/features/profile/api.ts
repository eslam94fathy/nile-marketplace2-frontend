import { unwrap } from '@nile/api';
import { queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// The seller's profile and status (design 02 §2.3 `profile`): header, status banner, later SE-06 and SE-07.

const PROFILE_STALE_TIME_MS = 60_000;

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
