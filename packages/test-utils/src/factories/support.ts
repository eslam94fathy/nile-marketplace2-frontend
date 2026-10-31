import { defineFactory, fixtureId } from '../factory';

/** `TicketSummaryDto`: an open order ticket waiting for support, read. */
export const ticketFactory = defineFactory<'TicketSummaryDto'>((sequence) => ({
  id: fixtureId(2000 + sequence),
  ticketNumber: `T-${String(sequence).padStart(9, '0')}`,
  category: 'order',
  subject: 'Where is my parcel?',
  status: 'awaiting_admin',
  order: null,
  sellerOrderId: null,
  lastMessageAt: '2026-10-30T10:00:00.000Z',
  hasUnread: false,
  createdAt: '2026-10-30T09:00:00.000Z',
}));

/** `TicketMessageDto`: the user's own message without photos. */
export const ticketMessageFactory = defineFactory<'TicketMessageDto'>((sequence) => ({
  id: fixtureId(3000 + sequence),
  kind: 'message',
  sender: { role: 'customer', isMe: true, displayName: 'Mona Ali' },
  body: `Message ${sequence}`,
  attachments: [],
  createdAt: new Date(Date.UTC(2026, 9, 30, 9, 0, sequence)).toISOString(),
}));

/** `AdminTicketSummaryDto` (ids from 21000): a customer's unassigned order ticket waiting for support. */
export const adminTicketFactory = defineFactory<'AdminTicketSummaryDto'>((sequence) => ({
  id: fixtureId(21000 + sequence),
  ticketNumber: `T-${String(21000 + sequence).padStart(9, '0')}`,
  category: 'order',
  subject: 'Where is my parcel?',
  status: 'awaiting_admin',
  order: null,
  sellerOrderId: null,
  lastMessageAt: '2026-10-30T10:00:00.000Z',
  hasUnread: true,
  createdAt: '2026-10-30T09:00:00.000Z',
  opener: {
    userId: fixtureId(21200 + sequence),
    role: 'customer',
    displayName: 'Mona Ali',
    email: `customer${sequence}@example.test`,
  },
  assignedAdmin: null,
  slaBreachedAt: null,
  awaitingAdminSince: '2026-10-30T10:00:00.000Z',
}));
