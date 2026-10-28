import type { Metadata } from 'next';
import { NotificationSettings, SETTINGS_COPY } from '@nile/notifications';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: SETTINGS_COPY.title };

/** AG-10 Notification settings: this device's push and the categories, fetched on the client. */
export default async function NotificationSettingsPage() {
  await requireSession();
  return <NotificationSettings />;
}
