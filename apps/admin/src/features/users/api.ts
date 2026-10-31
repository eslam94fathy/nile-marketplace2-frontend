import { unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import type { QueryClient } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import { userApiQuery, type UserFilters } from './lib/list-params';

// User directory and the account actions every admin screen shares (spec 03 AD-03, AD-24, AD-26; design 02
// §5.2 `users.list`). Refreshed on focus, never polled.

export type AdminUser = Schema<'AdminUserListItemDto'>;
export type UserStatusResult = Schema<'UserStatusDto'>;

const USERS_PAGE_SIZE = 20;

export const userKeys = {
  lists: () => queryKey('admin', 'users', 'list'),
  list: (filters: UserFilters) => queryKey('admin', 'users', 'list', filters),
};

/**
 * Every view that shows an account's status: the directory, admins (AD-03) and customers (AD-25, AD-26). The
 * prefixes are literal here because those features build on this one.
 */
const ACCOUNT_STATUS_VIEWS = [
  ['admin', 'users'],
  ['admin', 'admins'],
  ['admin', 'customers'],
] as const;

export async function refreshAccountViews(queryClient: QueryClient): Promise<void> {
  await Promise.all(ACCOUNT_STATUS_VIEWS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function usersListOptions(filters: UserFilters) {
  return {
    ...infiniteListOptions({
      queryKey: userKeys.list(filters),
      fetchPage: async (cursor, signal) =>
        unwrap(
          browserApi.GET('/api/v1/admin/users', {
            params: {
              query: {
                limit: USERS_PAGE_SIZE,
                ...userApiQuery(filters),
                ...(cursor === undefined ? {} : { cursor }),
              },
            },
            signal,
          }),
        ),
    }),
    refetchOnWindowFocus: true,
  };
}

const userPath = (userId: string) => ({ params: { path: { userId } } });

/** A new link; the previous one stops working (spec 03 AD-03). */
export async function resendInvite(userId: string): Promise<void> {
  await unwrap(browserApi.POST('/api/v1/admin/users/{userId}/resend-invite', userPath(userId)));
}

export async function suspendUser(userId: string, reason: string) {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/users/{userId}/suspend', { ...userPath(userId), body: { reason } }),
    )
  ).data;
}

export async function reactivateUser(userId: string) {
  return (await unwrap(browserApi.POST('/api/v1/admin/users/{userId}/reactivate', userPath(userId)))).data;
}
