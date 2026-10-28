import type { NotificationCategory, TicketCategory, TicketStatus } from '../enums';
import type { Labels } from './types';

/** User view (customer, seller): spec 01 §10.6. Admin view: spec 03 §7.6. */
export const TICKET_STATUS_LABELS = {
  user: {
    open: 'Sent',
    awaiting_admin: 'Waiting for support',
    awaiting_user: 'Support replied',
    resolved: 'Solved',
    closed: 'Closed',
  },
  admin: {
    open: 'New',
    awaiting_admin: 'Waiting for support',
    awaiting_user: 'Waiting for user',
    resolved: 'Resolved',
    closed: 'Closed',
  },
} as const satisfies Readonly<Record<'user' | 'admin', Labels<TicketStatus>>>;

/** Spec 01 §10.6 and spec 02 SE-25; `seller_onboarding` is offered to sellers only. */
export const TICKET_CATEGORY_LABELS = {
  order: 'Order',
  payment: 'Payment',
  delivery: 'Delivery',
  return: 'Return',
  account: 'Account',
  seller_onboarding: 'Seller account',
  other: 'Other',
} as const satisfies Labels<TicketCategory>;

/** Spec 00 §12.6 and spec 01 §10.6. */
export const NOTIFICATION_CATEGORY_LABELS = {
  orders: 'Orders',
  shipments: 'Deliveries',
  support: 'Support',
  promotions: 'Offers',
} as const satisfies Labels<NotificationCategory>;
