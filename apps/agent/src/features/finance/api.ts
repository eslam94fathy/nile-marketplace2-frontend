import { unwrap, type Schema } from '@nile/api';
import { cairoDayBounds } from '@nile/domain';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// The agent's money (spec 04 AG-07; design 02 §2.5 `finance.*`). Read on every visit, never polled (DQ-9):
// the ledger is booked by the backend worker a few moments after a delivery [SPEC 12].

export type LedgerEntry = Schema<'LedgerEntryDto'>;
export type Remittance = Schema<'RemittanceDto'>;
export type AgentAccount = 'fee' | 'cod';

export interface DayRange {
  /** Cairo calendar days `YYYY-MM-DD`, inclusive. */
  readonly from: string | null;
  readonly to: string | null;
}

const PAGE_SIZE = 20;

export const financeKeys = {
  balances: () => queryKey('agent', 'finance', 'balances'),
  entries: (account: AgentAccount, range: DayRange) =>
    queryKey('agent', 'finance', 'entries', { account, ...range }),
  remittances: () => queryKey('agent', 'finance', 'remittances'),
};

const cursorOf = (cursor: string | undefined) => (cursor === undefined ? {} : { cursor });

export function balancesQuery() {
  return queryOptions({
    queryKey: financeKeys.balances(),
    queryFn: async ({ signal }) =>
      (await unwrap(browserApi.GET('/api/v1/agent/finance/balances', { signal }))).data,
    staleTime: 0,
  });
}

export function entriesOptions(account: AgentAccount, range: DayRange) {
  return infiniteListOptions({
    queryKey: financeKeys.entries(account, range),
    fetchPage: (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/agent/finance/entries', {
          params: {
            query: {
              account,
              limit: PAGE_SIZE,
              sort: '-createdAt',
              ...(range.from === null ? {} : { 'createdAt[gte]': cairoDayBounds(range.from).start }),
              ...(range.to === null ? {} : { 'createdAt[lte]': cairoDayBounds(range.to).end }),
              ...cursorOf(cursor),
            },
          },
          signal,
        }),
      ),
    staleTime: 0,
  });
}

export function remittancesOptions() {
  return infiniteListOptions({
    queryKey: financeKeys.remittances(),
    fetchPage: (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/agent/finance/remittances', {
          params: { query: { limit: PAGE_SIZE, sort: '-createdAt', ...cursorOf(cursor) } },
          signal,
        }),
      ),
    staleTime: 0,
  });
}
