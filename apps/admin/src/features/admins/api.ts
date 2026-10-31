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
