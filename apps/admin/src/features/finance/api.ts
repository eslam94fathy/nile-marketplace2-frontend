import { isApiError, unwrap, type Schema } from '@nile/api';
import type { AccountType } from '@nile/domain';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import {
  accountApiQuery,
  entryApiQuery,
  payoutApiQuery,
  remittanceApiQuery,
  type AccountFilters,
  type EntryFilters,
  type PayoutFilters,
  type ReferenceQuery,
  type RemittanceFilters,
} from './lib/params';

// Finance (spec 03 AD-18…AD-22; design 02 §2.4 `finance.*`, §3.4 "COD remittance", "Payout"). Finance data
// is read on every visit, never polled (DQ-9): every query here is stale 0.

export type Account = Schema<'AccountDto'>;
export type LedgerEntry = Schema<'LedgerEntryDto'>;
export type ReferenceEntry = Schema<'ReferenceEntryDto'>;
export type Remittance = Schema<'RemittanceDto'>;
export type Payout = Schema<'PayoutDto'>;
export type CreateRemittanceBody = Schema<'CreateRemittanceDto'>;
export type CreatePayoutBody = Schema<'CreatePayoutDto'>;

const PAGE_SIZE = 20;
/** An owner has at most one account of each type [SPEC 12]. */
const OWNER_ACCOUNTS_LIMIT = 10;

export const financeKeys = {
  /** Every finance query, including the agent page's balances (same scope). */
  all: () => ['admin', 'finance'] as const,
  accounts: (filters: AccountFilters) => queryKey('admin', 'finance', 'accounts', filters),
  ownerAccount: (ownerId: string, accountType: AccountType) =>
    queryKey('admin', 'finance', 'ownerAccount', { ownerId, accountType }),
  account: (accountId: string) => queryKey('admin', 'finance', 'account', { accountId }),
  entries: (accountId: string, filters: EntryFilters) =>
    queryKey('admin', 'finance', 'entries', { accountId, ...filters }),
  remittances: (filters: RemittanceFilters) => queryKey('admin', 'finance', 'remittances', filters),
  payouts: (filters: PayoutFilters) => queryKey('admin', 'finance', 'payouts', filters),
  reference: (reference: ReferenceQuery) => queryKey('admin', 'finance', 'reference', reference),
  dashboard: () => queryKey('admin', 'dashboard', 'agentsHoldingCod'),
};

const cursorOf = (cursor: string | undefined) => (cursor === undefined ? {} : { cursor });

/** AD-18. */
export function accountsListOptions(filters: AccountFilters) {
  return infiniteListOptions({
    queryKey: financeKeys.accounts(filters),
    fetchPage: (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/finance/accounts', {
          params: { query: { limit: PAGE_SIZE, ...accountApiQuery(filters), ...cursorOf(cursor) } },
          signal,
        }),
      ),
    staleTime: 0,
  });
}

/**
 * One owner's account of one type (the balance a remittance or payout is checked against), or null when it
 * doesn't exist yet: the backend counts that as 0.00 (SPEC 12 FI-5, FI-6).
 */
export function ownerAccountQuery(ownerId: string, accountType: AccountType) {
  return queryOptions({
    queryKey: financeKeys.ownerAccount(ownerId, accountType),
    queryFn: async ({ signal }) => {
      const { data } = await unwrap(
        browserApi.GET('/api/v1/admin/finance/accounts', {
          params: {
            query: { limit: OWNER_ACCOUNTS_LIMIT, 'ownerId[eq]': ownerId, 'accountType[eq]': accountType },
          },
          signal,
        }),
      );
      return data[0] ?? null;
    },
    staleTime: 0,
  });
}

/** AD-19 header. */
export function accountQuery(accountId: string) {
  return queryOptions({
    queryKey: financeKeys.account(accountId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/finance/accounts/{accountId}', {
            params: { path: { accountId } },
            signal,
          }),
        )
      ).data,
    staleTime: 0,
  });
}

/** No such account, or not an account id at all (the backend checks the id format first, as R-36). */
export function isAccountMissing(error: unknown): boolean {
  return isApiError(error, 'ACCOUNT_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}

/** AD-19 entries, newest first. */
export function entriesListOptions(accountId: string, filters: EntryFilters) {
  return infiniteListOptions({
    queryKey: financeKeys.entries(accountId, filters),
    fetchPage: (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/finance/accounts/{accountId}/entries', {
          params: {
            path: { accountId },
            query: { limit: PAGE_SIZE, ...entryApiQuery(filters), ...cursorOf(cursor) },
          },
          signal,
        }),
      ),
    staleTime: 0,
  });
}

/** AD-20. */
export function remittancesListOptions(filters: RemittanceFilters) {
  return infiniteListOptions({
    queryKey: financeKeys.remittances(filters),
    fetchPage: (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/finance/cod-remittances', {
          params: { query: { limit: PAGE_SIZE, ...remittanceApiQuery(filters), ...cursorOf(cursor) } },
          signal,
        }),
      ),
    staleTime: 0,
  });
}

/** AD-21. */
export function payoutsListOptions(filters: PayoutFilters) {
  return infiniteListOptions({
    queryKey: financeKeys.payouts(filters),
    fetchPage: (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/finance/payouts', {
          params: { query: { limit: PAGE_SIZE, ...payoutApiQuery(filters), ...cursorOf(cursor) } },
          signal,
        }),
      ),
    staleTime: 0,
  });
}

/** AD-22: unpaginated, at most 6 entries [SPEC 12]. */
export function referenceQuery(reference: ReferenceQuery) {
  return queryOptions({
    queryKey: financeKeys.reference(reference),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/finance/entries', { params: { query: reference }, signal }),
        )
      ).data,
    staleTime: 0,
  });
}

/** `Idempotency-Key` per confirmed intent, reused on every retry of it (spec 03 §2.2). */
export async function createRemittance(
  body: CreateRemittanceBody,
  idempotencyKey: string,
): Promise<Remittance> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/finance/cod-remittances', {
        params: { header: { 'Idempotency-Key': idempotencyKey } },
        body,
      }),
    )
  ).data;
}

export async function createPayout(body: CreatePayoutBody, idempotencyKey: string): Promise<Payout> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/finance/payouts', {
        params: { header: { 'Idempotency-Key': idempotencyKey } },
        body,
      }),
    )
  ).data;
}
