import { defineNotificationLinks, mapNotificationLink } from '@nile/domain';
import { ROUTES, shipmentPath } from '@/lib/routes';

/** The API notification links this app opens (spec 00 §12.5); any other link is shown without one. */
export const NOTIFICATION_LINKS = defineNotificationLinks({
  '/agent/shipments/{shipmentId}': ({ shipmentId }) => shipmentPath(shipmentId),
});

/** Where a push notification's click lands (`/notifications/open`, design 01 §15.5). */
export function notificationOpenPath(link: string | null): string {
  return mapNotificationLink(NOTIFICATION_LINKS, link) ?? ROUTES.notifications;
}
