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
