import { type ApiClient, unwrap, type Schema } from '@nile/api';
import type { NotificationCategory } from '@nile/domain';
import { infiniteListOptions, queryKey, type QueryScope } from '@nile/query';
import type { InvalidationMap } from '@nile/realtime';
import { queryOptions } from '@tanstack/react-query';

// The notification centre's data (design 02 §5.2 "Shared"): unread count, the bell's newest, the list,
// preferences and the push configuration. Keys live under the app's scope, so sign-out clears them.

export type UserNotification = Schema<'UserNotificationDto'>;
export type NotificationPreference = Schema<'NotificationPreferenceDto'>;
export type AppScope = Exclude<QueryScope, 'public'>;

/** The notifications page's filter (spec 00 §12.4: Unread / All, category chips). */
export interface NotificationFilter {
  readonly unreadOnly: boolean;
  readonly category: NotificationCategory | null;
}

export const ALL_NOTIFICATIONS: NotificationFilter = { unreadOnly: false, category: null };

/** The bell panel shows the 10 newest (spec 00 §12.4). */
export const BELL_PAGE_SIZE = 10;
/** Notifications page size. */
export const NOTIFICATIONS_PAGE_SIZE = 20;
/** Without a socket the count is polled while the tab is visible (design 02 §5.2). */
export const UNREAD_POLL_MS = 60_000;
/** Preferences change only here; five minutes as design 02 §5.2. */
export const PREFERENCES_STALE_MS = 5 * 60_000;

export const notificationKeys = (scope: AppScope) => ({
  /** Prefix of everything a new notification makes stale. */
  all: () => queryKey(scope, 'notifications', 'all'),
  unreadCount: () => queryKey(scope, 'notifications', 'all', { view: 'unread-count' }),
  latest: () => queryKey(scope, 'notifications', 'all', { view: 'latest' }),
  lists: () => queryKey(scope, 'notifications', 'all', { view: 'list' }),
  // Query keys match objects partially, so `lists()` is the prefix of every filtered list.
  list: (filter: NotificationFilter) => queryKey(scope, 'notifications', 'all', { view: 'list', ...filter }),
  preferences: () => queryKey(scope, 'notifications', 'preferences'),
  pushConfig: () => queryKey(scope, 'push', 'config'),
});

/** `notification.created` → the count, the bell and every list (design 02 §5.3). */
export function notificationsInvalidation(scope: AppScope) {
  const keys = notificationKeys(scope);
  return { 'notification.created': () => [keys.all()] } satisfies InvalidationMap;
}

export function unreadCountQuery(api: ApiClient, scope: AppScope, polling: boolean) {
  return queryOptions({
    queryKey: notificationKeys(scope).unreadCount(),
    queryFn: async ({ signal }) =>
      (await unwrap(api.GET('/api/v1/me/notifications/unread-count', { signal }))).data.count,
    staleTime: 0,
    // Visible tab only (TanStack Query pauses intervals in the background by default).
    refetchInterval: polling ? UNREAD_POLL_MS : false,
  });
}

export function latestNotificationsQuery(api: ApiClient, scope: AppScope) {
  return queryOptions({
    queryKey: notificationKeys(scope).latest(),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          api.GET('/api/v1/me/notifications', {
            params: { query: { limit: BELL_PAGE_SIZE, sort: '-createdAt' } },
            signal,
          }),
        )
      ).data,
    staleTime: 0,
  });
}

/** `GET /me/notifications`, newest first, with the page's filter; "Load more" follows the cursor. */
export function notificationsListOptions(api: ApiClient, scope: AppScope, filter: NotificationFilter) {
  return infiniteListOptions({
    queryKey: notificationKeys(scope).list(filter),
    fetchPage: (cursor, signal) =>
      unwrap(
        api.GET('/api/v1/me/notifications', {
          params: {
            query: {
              limit: NOTIFICATIONS_PAGE_SIZE,
              sort: '-createdAt',
              ...(filter.unreadOnly ? { 'read[eq]': false } : {}),
              ...(filter.category === null ? {} : { 'category[eq]': filter.category }),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
    staleTime: 0,
  });
}

export function preferencesQuery(api: ApiClient, scope: AppScope) {
  return queryOptions({
    queryKey: notificationKeys(scope).preferences(),
    queryFn: async ({ signal }) =>
      (await unwrap(api.GET('/api/v1/me/notification-preferences', { signal }))).data,
    staleTime: PREFERENCES_STALE_MS,
  });
}

/** The VAPID public key: fixed for the session (design 02 §5.2). */
export function pushConfigQuery(api: ApiClient, scope: AppScope) {
  return queryOptions({
    queryKey: notificationKeys(scope).pushConfig(),
    queryFn: async ({ signal }) => (await unwrap(api.GET('/api/v1/push/config', { signal }))).data,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export async function markNotificationRead(api: ApiClient, notificationId: string): Promise<void> {
  await unwrap(
    api.POST('/api/v1/me/notifications/{notificationId}/read', { params: { path: { notificationId } } }),
  );
}

export async function markAllNotificationsRead(api: ApiClient): Promise<void> {
  await unwrap(api.POST('/api/v1/me/notifications/read-all'));
}

/** `PUT /me/notification-preferences` with only the changed categories (backend spec 13 NO-18). */
export async function savePreferences(
  api: ApiClient,
  changed: readonly NotificationPreference[],
): Promise<NotificationPreference[]> {
  return (
    await unwrap(
      api.PUT('/api/v1/me/notification-preferences', {
        body: { preferences: changed.map(({ category, pushEnabled }) => ({ category, pushEnabled })) },
      }),
    )
  ).data;
}
