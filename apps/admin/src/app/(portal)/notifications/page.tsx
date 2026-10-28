import type { Metadata } from 'next';
import { NOTIFICATIONS_COPY, NotificationsPage, parseNotificationFilter } from '@nile/notifications';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: NOTIFICATIONS_COPY.title };

/** AD-40 Notifications: the filter comes from `?show=&category=`; the list is fetched on the client. */
export default async function YourNotificationsPage({ searchParams }: PageProps<'/notifications'>) {
  await requireSession();
  return <NotificationsPage filter={parseNotificationFilter(await searchParams)} />;
}
