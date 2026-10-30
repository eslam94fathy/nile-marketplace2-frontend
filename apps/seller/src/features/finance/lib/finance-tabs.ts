// SE-16 tabs in the URL (`/finance?tab=statement|on-hold|payouts`); no or unknown tab is the statement.

export const FINANCE_TAB_PARAM = 'tab';
export const FINANCE_TABS = ['statement', 'on-hold', 'payouts'] as const;
export type FinanceTab = (typeof FINANCE_TABS)[number];

export function financeTab(param: string | null | undefined): FinanceTab {
  return FINANCE_TABS.find((tab) => tab === param) ?? 'statement';
}

/**
 * Ledger entries the seller statement (`seller_payable`) can have [SPEC 12 §1.2, §8.3, §8.4]; anything else
 * is shown raw and reported. `seller_net_held` books to `seller_pending`, which the statement doesn't list.
 */
export const SELLER_ENTRY_TYPES = [
  'seller_net_earned',
  'seller_payout',
  'seller_net_released',
  'seller_net_reversed',
  'return_fee_charged',
] as const;
