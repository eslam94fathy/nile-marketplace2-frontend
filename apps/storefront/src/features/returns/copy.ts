import type { ReturnStatus } from './api';

// Returns copy (spec 01 SF-26…SF-28, §10.6). Status, reason, payout, refusal and refund labels are central in
// @nile/domain. Entries marked TK6-COPY approved 2026-10-30 (CLAUDE.md §14.1bd).

/** Spec 01 §10.6 "what happens next", one sentence per status; `{deadline}` / `{amount}` filled in. */
export const RETURN_NEXT_STEP = {
  requested: (deadline: string | null) =>
    deadline === null
      ? 'Waiting for the seller to respond.'
      : `The seller has until ${deadline} to respond. If they don't, your return is approved.`,
  rejected: (deadline: string | null) =>
    deadline === null
      ? 'The seller rejected this return.'
      : `You can ask Nile to review this until ${deadline}.`,
  escalated: () => "We'll let you know our decision.",
  approved: () => 'An agent will collect the items from your address.',
  picked_up: () => 'The seller will check the items when they arrive.',
  received: (deadline: string | null) =>
    deadline === null
      ? 'Your refund starts once the seller confirms.'
      : `Your refund starts once the seller confirms (by ${deadline}).`,
  disputed: () => "The seller raised a problem with the returned items. We'll decide and let you know.",
  completed: (_deadline: string | null, amount?: string) =>
    amount === undefined ? 'Your refund is on its way.' : `Your refund of ${amount} is on its way.`,
  refused: () => null,
  cancelled: () => null,
  pickup_failed: () => "We couldn't collect the items. Contact support if you still want to return them.",
} as const satisfies Record<ReturnStatus, (deadline: string | null, amount?: string) => string | null>;

// TK6-COPY (the fallbacks without a deadline above are TK6-COPY too: a deadline can be missing in the DTO).

export const RETURNS_COPY = {
  // SF-27
  title: 'Your returns',
  /** TK6-COPY */
  tabsLabel: 'Return status',
  /** TK6-COPY */
  tabs: { open: 'Open', closed: 'Closed' },
  empty: 'You have no returns.',
  /** TK6-COPY */
  returnLabel: (returnNumber: string) => `Return ${returnNumber}`,
  /** TK6-COPY */
  order: (orderNumber: string) => `Order ${orderNumber}`,
  /** TK6-COPY */
  items: (count: number) => (count === 1 ? '1 item' : `${String(count)} items`),
  requested: (date: string) => `Requested ${date}`,
  estimated: 'Estimated',
  /** TK6-COPY */
  loadFailed: "Your returns couldn't be loaded.",

  // SF-28
  /** TK6-COPY: the page title before the return is loaded. */
  detailTitle: 'Return',
  /** TK6-COPY: section headings. */
  nextHeading: 'What happens next',
  itemsHeading: 'Items',
  reasonHeading: 'Reason',
  photosHeading: 'Photos',
  refundHeading: 'Refund',
  historyHeading: 'History',
  /** TK6-COPY */
  deadline: 'Deadline',
  /** TK6-COPY */
  quantity: (quantity: number) => `Qty ${String(quantity)}`,
  /** TK6-COPY */
  returnFee: 'Return fee',
  /** TK6-COPY: who pays the fee. */
  feePaidBy: { seller: 'Paid by the seller', customer: 'Taken from your refund' },
  /** TK6-COPY */
  estimatedRefund: 'Estimated refund',
  /** TK6-COPY */
  refundAmount: 'Refund',
  /** TK6-COPY */
  refundedOn: (date: string) => `Refunded ${date}`,
  /** TK6-COPY */
  sellerReason: "Seller's reason",
  /** TK6-COPY */
  photosUnavailable: "The photos can't be shown right now.",
  /** TK6-COPY */
  detailLoadFailed: "This return couldn't be loaded.",
  cancel: {
    /** TK6-COPY */
    action: 'Cancel return',
    title: 'Cancel this return?',
    /** TK6-COPY */
    description: "The items stay with you and nothing is refunded. You can't undo this.",
    /** TK6-COPY */
    confirm: 'Cancel return',
    /** TK6-COPY */
    keep: 'Keep return',
    /** TK6-COPY */
    done: 'Return cancelled.',
    alreadyCollected: "The agent has already collected the items, so this return can't be cancelled.",
  },
  escalate: {
    /** TK6-COPY */
    action: 'Ask Nile to review',
    title: "Ask Nile to review the seller's decision",
    /** TK6-COPY */
    note: 'Why should Nile review it?',
    /** TK6-COPY */
    submit: 'Send',
    /** TK6-COPY */
    done: 'Sent to Nile for review.',
    windowClosed: 'The time to ask for a review has passed.',
  },
  /** TK6-COPY: a return photo's alt text (the customer's own photos have none). */
  photoAlt: (index: number, total: number) => `Your photo ${String(index)} of ${String(total)}`,
  /** TK6-COPY: the not-found screen's link. */
  backToReturns: 'Your returns',
} as const;

export const REQUEST_RETURN_COPY = {
  /** TK6-COPY */
  title: 'Return items',
  /** TK6-COPY */
  subtitle: (orderNumber: string, seller: string) => `Order ${orderNumber} · Sold by ${seller}`,
  /** TK6-COPY: section headings 1–5. */
  itemsHeading: 'Which items?',
  reasonHeading: 'Why are you returning them?',
  detailsHeading: 'Details',
  payoutHeading: 'Refund to',
  summaryHeading: 'Summary',
  paidEach: (amount: string) => `Paid ${amount} each`,
  /** TK6-COPY */
  quantityLabel: 'Quantity to return',
  /** TK6-COPY */
  chooseItems: 'Choose at least one item to return.',
  /** TK6-COPY */
  chooseReason: 'Choose a reason.',
  feeNote: (fee: string) => `The return delivery fee of ${fee} is taken from your refund.`,
  freeNote: 'Returning is free for you.',
  /** TK6-COPY */
  description: 'Description',
  photos: 'Photos',
  photoRequired: 'Add at least one photo showing the problem.',
  cardRefund: 'Your refund goes back to your card.',
  walletNumber: 'Wallet mobile number',
  /** TK6-COPY */
  instapayAddress: 'InstaPay address',
  payoutNote: 'We use this only to send your refund, then delete it.',
  /** TK6-COPY */
  choosePayout: 'Choose where to send your refund.',
  /** TK6-COPY */
  itemsValue: 'Items',
  returnFee: 'Return fee',
  /** Spec 01 SF-26 "Estimated refund {amount}": the label of the summary's last row. */
  estimatedRefund: 'Estimated refund',
  noDeliveryRefund: "The original delivery fee isn't refunded.",
  pickupNote: 'An agent will collect the items from your address after the seller approves.',
  /** TK6-COPY */
  submit: 'Request return',
  requested: (returnNumber: string) => `Return ${returnNumber} requested.`,
  windowClosed: (date: string) => `The return period for this order ended on ${date}.`,
  /** TK6-COPY: without a delivery date to compute the end from. */
  windowClosedNoDate: 'The return period for this order has ended.',
  notAllowed: "This part of your order can't be returned.",
  pickupUnavailable: "We can't collect returns from your area right now.",
  /** TK6-COPY: the API doesn't say which return is open; the link goes to the open returns. */
  alreadyOpen: 'This part of your order already has an open return.',
  /** TK6-COPY */
  seeOpenReturns: 'See your open returns',
  amountTooLow: "Your refund would be zero after the return fee, so this return isn't possible.",
  /** TK6-COPY */
  quantityChanged: 'Some quantities are no longer available. Check the items and try again.',
  /** TK6-COPY */
  backToOrder: 'Back to your order',
  /** TK6-COPY */
  loadFailed: "The items to return couldn't be loaded.",
} as const;
