// Seller finance copy (spec 02 SE-16, SE-06 item 4; DQ-9 note).

export const FINANCE_COPY = {
  title: 'Finance',
  owesYou: 'Nile owes you',
  available: 'Available',
  availableHelp: 'Nile can pay you this amount.',
  pending: 'Pending',
  pendingHelp: 'Earnings from delivered orders that are still within the 14-day return period.',
  owesNile: (amount: string) =>
    `You owe Nile ${amount} because of return fees. It’s taken from your next earnings.`,
  lastUpdated: (date: string) => `Last updated ${date}`,
  noEarnings: 'No earnings yet.',
  noEarningsOverview: 'No earnings yet. Earnings are added when an order is delivered.',
  explanation:
    "You earn the order amount minus Nile's commission when an order is delivered. Nile pays you outside the app and records each payout here.",
  asyncNote: 'Balances update a few moments after a delivery.',
  balanceFailed: "Your balance couldn't be loaded.",
  viewFinance: 'View finance',
  tabsLabel: 'Finance',
  tabs: { statement: 'Statement', payouts: 'Payouts' },

  statementCaption: 'Your statement',
  statementColumns: {
    date: 'Date',
    description: 'Description',
    amount: 'Amount',
    balanceAfter: 'Balance after',
  },
  earningsFromOrder: 'Earnings from order',
  payout: 'Payout',
  earningsReleased: 'Earnings released',
  returnedItems: 'Returned items',
  returnFee: 'Return delivery fee',
  statementEmpty: 'No transactions yet.',
  statementFailed: "Your statement couldn't be loaded.",

  payoutsCaption: 'Your payouts',
  payoutColumns: { paidAt: 'Paid', amount: 'Amount', reference: 'Reference', recordedAt: 'Recorded' },
  payoutsEmpty: 'No payouts yet.',
  payoutsFailed: "Your payouts couldn't be loaded.",
} as const;
