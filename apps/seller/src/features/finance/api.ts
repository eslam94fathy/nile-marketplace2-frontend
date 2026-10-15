import { unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// Seller finance (design 02 §2.3 `finance.*`). Balances change asynchronously after a delivery (backend
// worker, DQ-9): read again on every visit (stale 0), never polled.

export type SellerBalance = Schema<'SellerBalanceDto'>;
export type LedgerEntry = Schema<'LedgerEntryDto'>;
export type Payout = Schema<'PayoutDto'>;

const FINANCE_PAGE_SIZE = 20;

export const financeKeys = {
  balance: () => queryKey('seller', 'finance', 'balance'),
  entries: () => queryKey('seller', 'finance', 'entries'),
  payouts: () => queryKey('seller', 'finance', 'payouts'),
};

export function balanceQuery() {
  return queryOptions({
    queryKey: financeKeys.balance(),
    queryFn: async ({ signal }) =>
      (await unwrap(browserApi.GET('/api/v1/seller/finance/balance', { signal }))).data,
    staleTime: 0,
  });
}

/** Statement: newest first, 20 per page (no date filter in R1, decided 2026-10-15). */
export function entriesListOptions() {
  return infiniteListOptions({
    queryKey: financeKeys.entries(),
    staleTime: 0,
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/seller/finance/entries', {
          params: {
            query: {
              limit: FINANCE_PAGE_SIZE,
              sort: '-createdAt',
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}

export function payoutsListOptions() {
  return infiniteListOptions({
    queryKey: financeKeys.payouts(),
    staleTime: 0,
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/seller/finance/payouts', {
          params: {
            query: {
              limit: FINANCE_PAGE_SIZE,
              sort: '-createdAt',
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}
