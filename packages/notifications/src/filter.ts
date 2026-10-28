import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@nile/domain';
import { ALL_NOTIFICATIONS, type NotificationFilter } from './api';

// The notifications page keeps its filter in the URL (as the order tabs, R-36): `?show=unread&category=orders`.
// Unknown values are dropped, never sent (R-28).

export const NOTIFICATION_FILTER_PARAMS = { show: 'show', category: 'category' } as const;
const SHOW_UNREAD = 'unread';

type SearchValue = string | readonly string[] | undefined;

const single = (value: SearchValue): string | undefined => (typeof value === 'string' ? value : undefined);

const isCategory = (value: string | undefined): value is NotificationCategory =>
  (NOTIFICATION_CATEGORIES as readonly string[]).includes(value ?? '');

/** The filter from the page's search parameters. */
export function parseNotificationFilter(
  params: Readonly<Partial<Record<string, SearchValue>>>,
): NotificationFilter {
  const category = single(params[NOTIFICATION_FILTER_PARAMS.category]);
  return {
    unreadOnly: single(params[NOTIFICATION_FILTER_PARAMS.show]) === SHOW_UNREAD,
    category: isCategory(category) ? category : ALL_NOTIFICATIONS.category,
  };
}

/** The page URL for a filter; the default filter is the bare path. */
export function notificationsHref(basePath: string, filter: NotificationFilter): string {
  const query = new URLSearchParams();
  if (filter.unreadOnly) query.set(NOTIFICATION_FILTER_PARAMS.show, SHOW_UNREAD);
  if (filter.category !== null) query.set(NOTIFICATION_FILTER_PARAMS.category, filter.category);
  const text = query.toString();
  return text === '' ? basePath : `${basePath}?${text}`;
}
