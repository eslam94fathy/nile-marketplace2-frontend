import { unwrap } from '@nile/api';
import { queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// Name lookups the admin screens share (spec 03 §2.2): DTOs carry ids, the console shows names.

/** Spec 03 §2.2: the admins list is small; cached 5 min. */
const ADMIN_DIRECTORY_STALE_MS = 5 * 60_000;
/** The API's maximum page (conventions: max 100). More admins than that only lose the email in histories. */
const ADMIN_DIRECTORY_SIZE = 100;

export const lookupKeys = {
  governorates: () => queryKey('admin', 'governorates', 'list'),
  adminDirectory: () => queryKey('admin', 'admins', 'directory'),
};

/** `GET /admin/governorates`: all 27, cached for the session (spec 03 §2.2). */
export function adminGovernoratesQuery() {
  return queryOptions({
    queryKey: lookupKeys.governorates(),
    queryFn: async ({ signal }) =>
      (await unwrap(browserApi.GET('/api/v1/admin/governorates', { signal }))).data,
    staleTime: Infinity,
  });
}

/** The admins, to name the admin behind a history entry (AD-Q-2). */
export function adminDirectoryQuery() {
  return queryOptions({
    queryKey: lookupKeys.adminDirectory(),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/admins', {
            params: { query: { limit: ADMIN_DIRECTORY_SIZE, sort: '-createdAt' } },
            signal,
          }),
        )
      ).data,
    staleTime: ADMIN_DIRECTORY_STALE_MS,
  });
}
