import { defineNotificationLinks, mapNotificationLink } from '@nile/domain';
import { couponPath, orderPath, productPath, returnPath, ROUTES, supportTicketPath } from '@/lib/routes';

/** The API notification links this app opens (spec 00 §12.5); any other link is shown without one. */
export const NOTIFICATION_LINKS = defineNotificationLinks({
  '/support/tickets/{ticketId}': ({ ticketId }) => supportTicketPath(ticketId),
  '/seller/orders/{sellerOrderId}': ({ sellerOrderId }) => orderPath(sellerOrderId),
  '/seller/returns/{returnId}': ({ returnId }) => returnPath(returnId),
  '/seller/products/{productId}': ({ productId }) => productPath(productId),
  '/seller/reviews': () => ROUTES.reviews,
  '/seller/coupons/{couponId}': ({ couponId }) => couponPath(couponId),
});

/** Where a push notification's click lands (`/notifications/open`, design 01 §15.5). */
export function notificationOpenPath(link: string | null): string {
  return mapNotificationLink(NOTIFICATION_LINKS, link) ?? ROUTES.notifications;
}
