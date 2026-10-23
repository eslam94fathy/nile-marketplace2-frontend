import { unwrap } from '@nile/api';
import { queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// The signed-in customer's profile (design 02 §2.2 `me.profile`): header account area now, SF-15 in T-G1.

const PROFILE_STALE_TIME_MS = 5 * 60_000;

export const accountKeys = {
  profile: () => queryKey('storefront', 'me', 'profile'),
};

export function profileQuery() {
  return queryOptions({
    queryKey: accountKeys.profile(),
    queryFn: async () => (await unwrap(browserApi.GET('/api/v1/me'))).data,
    staleTime: PROFILE_STALE_TIME_MS,
  });
}
