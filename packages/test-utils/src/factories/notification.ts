import { defineFactory, fixtureId } from '../factory';

/** `UserNotificationDto`: an unread order notification linking to its order. */
export const notificationFactory = defineFactory<'UserNotificationDto'>((sequence) => ({
  id: fixtureId(0x7000 + sequence),
  category: 'orders',
  type: 'seller_order_accepted',
  title: 'Order accepted',
  body: `Order #2026-${String(100_000 + sequence)} was accepted by the seller.`,
  link: `/orders/${fixtureId(0x8000 + sequence)}`,
  read: false,
  createdAt: '2026-10-28T10:00:00.000Z',
}));
