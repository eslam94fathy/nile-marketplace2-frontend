// Support copy (spec 00 §12.7, spec 01 SF-29…SF-31). Status and category labels are central in @nile/domain.
// Entries marked TK7-COPY approved 2026-10-30 (CLAUDE.md §14.1bf).

export const TICKET_LIST_COPY = {
  /** TK7-COPY: the navigation entry's name (SF-Q-13). */
  title: 'Help & support',
  newTicket: 'New ticket',
  /** TK7-COPY */
  tabsLabel: 'Tickets',
  /** TK7-COPY */
  tabs: { open: 'Open', closed: 'Closed' },
  empty: "You haven't contacted support yet.",
  /** TK7-COPY: the Closed tab without tickets. */
  emptyClosed: 'You have no closed tickets.',
  newReply: 'New reply',
  /** TK7-COPY */
  ticket: (ticketNumber: string) => `Ticket ${ticketNumber}`,
  /** TK7-COPY */
  order: (orderNumber: string) => `Order ${orderNumber}`,
  /** TK7-COPY */
  lastActivity: (relative: string) => `Last activity ${relative}`,
  /** TK7-COPY */
  loadFailed: "Your tickets couldn't be loaded.",
} as const;

export const NEW_TICKET_COPY = {
  title: 'New ticket',
  category: 'Category',
  order: 'Order',
  subject: 'Subject',
  message: 'Message',
  photos: 'Photos',
  /** TK7-COPY */
  categoryPlaceholder: 'Choose a category',
  /** TK7-COPY: the order select's "none" entry. */
  noOrder: 'No order',
  /** TK7-COPY */
  orderOption: (orderNumber: string) => `Order ${orderNumber}`,
  /** TK7-COPY: a parcel linked through the URL. */
  sellerLine: (businessName: string) => `About the items sold by ${businessName}`,
  /** TK7-COPY */
  ordersLoadFailed: "Your orders couldn't be loaded. You can still send the ticket without one.",
  /** TK7-COPY */
  submit: 'Send ticket',
  /** TK7-COPY */
  chooseCategory: 'Choose a category.',
  /** TK7-COPY: `SUPPORT_CATEGORY_NOT_ALLOWED`. */
  categoryNotAllowed: 'Choose another category.',
  chooseOrder: 'Choose one of your orders.',
  limitReached: 'You have 20 open tickets. Please wait for replies before opening another.',
  /** TK7-COPY */
  cancel: 'Cancel',
} as const;

export const THREAD_COPY = {
  /** TK7-COPY */
  ticket: (ticketNumber: string) => `Ticket ${ticketNumber}`,
  /** TK7-COPY */
  order: (orderNumber: string) => `Order ${orderNumber}`,
  /** TK7-COPY */
  messagesLabel: 'Messages',
  loadEarlier: 'Load earlier messages',
  you: 'You',
  newMessages: 'New messages ↓',
  reconnecting: 'Reconnecting…',
  resolved: 'Marked as solved. Reply within 7 days to reopen it.',
  closed: 'This ticket is closed. Open a new ticket if you still need help.',
  newTicket: 'New ticket',
  /** TK7-COPY */
  messageLabel: 'Your message',
  /** TK7-COPY: keyboard hint under the composer. */
  sendHint: 'Press Ctrl+Enter to send.',
  send: 'Send',
  retry: 'Retry',
  /** TK7-COPY */
  sendFailed: "Your message wasn't sent.",
  /** TK7-COPY: the other side is typing (users see admins as "Nile Support", backend SU-3). */
  supportTyping: 'Nile Support is typing…',
  /** TK7-COPY: polite announcement of new messages. */
  newMessageAnnouncement: (count: number) => (count === 1 ? 'New message.' : `${count} new messages.`),
  /** TK7-COPY: a photo in a message. */
  photoAlt: (index: number, total: number, sender: string) => `Photo ${index} of ${total} from ${sender}`,
  /** TK7-COPY */
  loadFailed: "This ticket couldn't be loaded.",
  /** TK7-COPY */
  messagesLoadFailed: "The messages couldn't be loaded.",
  /** TK7-COPY: the not-found screen's link. */
  backToTickets: 'Back to your tickets',
  /** TK7-COPY */
  writeMessage: 'Write a message.',
  /** TM5-COPY: an internal note's sender line (admins only, spec 03 §7.6 "Internal note"). */
  internalNoteBy: (sender: string) => `Internal note · ${sender}`,
} as const;
