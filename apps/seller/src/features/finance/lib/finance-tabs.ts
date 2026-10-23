// SE-16 tabs in the URL (`/finance?tab=statement|payouts`); no or unknown tab is the statement.

export const FINANCE_TAB_PARAM = 'tab';
export const FINANCE_TABS = ['statement', 'payouts'] as const;
export type FinanceTab = (typeof FINANCE_TABS)[number];

export function financeTab(param: string | null | undefined): FinanceTab {
  return FINANCE_TABS.find((tab) => tab === param) ?? 'statement';
}

/** Ledger entries a seller's account can have [SPEC 12 §1.2]; anything else is shown raw and reported. */
export const SELLER_ENTRY_TYPES = ['seller_net_earned', 'seller_payout'] as const;
