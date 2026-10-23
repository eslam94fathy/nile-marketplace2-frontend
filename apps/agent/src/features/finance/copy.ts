// AG-07 Finance copy (spec 04).

export const FINANCE_COPY = {
  title: 'Finance',
  balancesFailed: "Your balances couldn't be loaded.",
  owedTitle: 'Nile owes you',
  owedHelp: 'Your share of delivery fees for delivered parcels. Paid by Nile outside the app.',
  cashTitle: 'Cash to hand in',
  cashHelp: 'Cash you collected on delivery that you still need to hand in.',
  asyncNote: 'Balances update a few moments after a delivery.',
  tabsLabel: 'Finance lists',
  tabs: { fees: 'Fees', cash: 'Cash', handins: 'Hand-ins' },
  from: 'From',
  to: 'To',
  descriptions: {
    agent_fee_earned: 'Fee for delivery',
    agent_payout: 'Payout',
    cod_cash_collected: 'Collected on delivery',
    cod_cash_remitted: 'Handed in',
  },
  balanceAfter: (amount: string) => `Balance ${amount}`,
  entriesFailed: "Your transactions couldn't be loaded.",
  handinsFailed: "Your hand-ins couldn't be loaded.",
  noEntries: 'No transactions yet.',
  noHandins: 'No hand-ins yet.',
  confirmedByAdmin: 'Confirmed by an admin',
} as const;
