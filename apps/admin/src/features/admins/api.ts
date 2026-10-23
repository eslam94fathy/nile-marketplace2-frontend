import { unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { browserApi } from '@/lib/browser-api';

// Admin accounts (spec 03 AD-03; design 02 §2.4). Refreshed on focus, never polled (spec 03 §5).

export type AdminListItem = Schema<'AdminListItemDto'>;
export type AdminStatus = AdminListItem['status'];

const ADMINS_PAGE_SIZE = 20;

export const adminKeys = {
  lists: () => queryKey('admin', 'admins', 'list'),
  list: (status: AdminStatus | null) => queryKey('admin', 'admins', 'list', { status }),
};

export function adminsListOptions(status: AdminStatus | null) {
  return {
    ...infiniteListOptions({
      queryKey: adminKeys.list(status),
      fetchPage: async (cursor, signal) =>
        unwrap(
          browserApi.GET('/api/v1/admin/admins', {
            params: {
              query: {
                limit: ADMINS_PAGE_SIZE,
                sort: '-createdAt',
                ...(status === null ? {} : { 'status[eq]': status }),
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

export async function inviteAdmin(email: string) {
  return (await unwrap(browserApi.POST('/api/v1/admin/admins', { body: { email } }))).data;
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
