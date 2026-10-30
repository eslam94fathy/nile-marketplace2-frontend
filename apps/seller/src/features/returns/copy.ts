import type { ReturnTabKey } from './lib/tabs';

// Seller returns copy (spec 02 §8.3 SE-18, SE-19, SE-06). Status and reason labels: @nile/domain
// RETURN_STATUS_LABELS.seller, RETURN_REASON_LABELS.staff (spec 02 §8.6). The rest approved as TL3-COPY (CLAUDE.md §14.1bj).

export const RETURNS_COPY = {
  // SE-18
  title: 'Returns',
  tabsLabel: 'Return status',
  tabs: {
    'to-decide': 'To decide',
    'to-check': 'To check',
    'in-progress': 'In progress',
    closed: 'Closed',
  } satisfies Record<ReturnTabKey, string>,
  caption: 'Your returns',
  columns: {
    return: 'Return',
    order: 'Order',
    reason: 'Reason',
    items: 'Items',
    refund: 'Refund',
    status: 'Status',
    deadline: 'Deadline',
  },
  returnNumber: (number: string) => `Return ${number}`,
  orderNumber: (number: string) => `Order ${number}`,
  itemCount: (count: number) => (count === 1 ? '1 item' : `${String(count)} items`),
  /** countdown labels */
  timeToDecide: 'Time left to decide',
  timeToCheck: 'Time left to check the items',
  empty: {
    'to-decide': 'No returns waiting for your decision.',
    'to-check': 'No returned items to check.',
    'in-progress': 'No returns in progress.',
    closed: 'No closed returns yet.',
  } satisfies Record<ReturnTabKey, string>,
  listFailed: "Your returns couldn't be loaded.",

  // SE-19
  loadFailed: "This return couldn't be loaded.",
  notFound: "This return doesn't exist.",
  backToReturns: 'Back to returns',
  /** section headings */
  reasonHeading: 'Reason',
  descriptionHeading: "Customer's description",
  photosHeading: 'Photos',
  itemsHeading: 'Items',
  refundHeading: 'Refund',
  deadlinesHeading: 'Deadlines',
  timelineHeading: 'Timeline',
  sellerFault: (fee: string) => `You pay the return delivery fee of ${fee}.`,
  photoAlt: (position: number, total: number) => `Customer's photo ${String(position)} of ${String(total)}`,
  quantity: (count: number) => `Qty ${String(count)}`,
  /** the paid amount of the returned units */
  paid: 'Paid',
  /** after receipt: the seller's restock choice */
  restocked: 'Put back in stock',
  notRestocked: 'Not put back in stock',
  refundAmount: 'Refund to the customer',
  deadlines: {
    decision: 'Decide by',
    inspection: 'Check the items by',
    escalation: 'The customer can ask Nile to review until',
  },
  yourReason: 'Your reason',

  // Actions
  approve: 'Approve',
  approveTitle: 'Approve return',
  approveConfirm:
    'Approve this return? An agent will collect the items from the customer and bring them to your pickup address.',
  approved: 'Return approved.',
  reject: 'Reject',
  rejectTitle: 'Reject return',
  rejectReason: 'Why are you rejecting it?',
  rejectNote: 'The customer can ask Nile to review your decision.',
  rejected: 'Return rejected.',
  confirmReceipt: 'Confirm receipt',
  confirmReceiptTitle: 'Confirm receipt',
  restock: 'Put back in stock',
  /** the restock checkbox's accessible name */
  restockItem: (product: string) => `Put ${product} back in stock`,
  confirmReceiptNote: (deadline: string) =>
    `The customer is refunded once you confirm. If you don't respond by ${deadline}, the return is confirmed without restocking.`,
  confirmed: 'Receipt confirmed.',
  dispute: 'Report a problem',
  disputeTitle: 'Report a problem',
  disputeReason: "What's wrong with the returned items?",
  disputePhotos: 'Photos (optional)',
  disputeNote: 'Nile will review and decide whether the customer is refunded.',
  disputed: 'Sent to Nile for review.',
  send: 'Send',
  cancel: 'Cancel',
  errors: {
    RETURN_INVALID_STATUS_TRANSITION:
      'This return was already updated (for example approved automatically when the deadline passed).',
    RETURN_INSPECTION_WINDOW_CLOSED: 'The time to report a problem has passed.',
    /** RETURN_ITEMS_MISMATCH: the dialog reopens with the current items. */
    RETURN_ITEMS_MISMATCH: 'The items of this return changed. Check them and confirm again.',
  },

  // SE-06 (SE-Q-11)
  toDecideHeading: 'Returns to decide',
  toCheckHeading: 'Returns to check',
  checkBy: (deadline: string) => `Check the returned items by ${deadline}`,
  decideWithin: 'Decide within',
  seeAll: 'See all',
  seeAllToDecide: 'See all returns to decide',
  seeAllToCheck: 'See all returns to check',
  queueFailed: "These returns couldn't be loaded.",
} as const;
