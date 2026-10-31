import { inValues } from '@nile/api';
import {
  cairoDayBounds,
  isCalendarDay,
  LEDGER_ENTRY_TYPES,
  LEDGER_REFERENCE_TYPES,
  type AccountType,
  type LedgerEntryType,
  type LedgerReferenceType,
} from '@nile/domain';
import * as z from 'zod';

// URL ⇄ API for the finance screens (spec 03 AD-18…AD-22). Invalid values are dropped, never sent (R-28).
// The parameter names `owner`/`type` (AD-18), `agent` (AD-20), `payeeType`/`payeeId` (AD-21) and
// `referenceType`/`referenceId` (AD-22) were fixed by earlier links (design 01 R-44, R-46, R-47).

export type RawParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const uuid = (value: string | undefined) => (z.uuid().safeParse(value).success ? (value ?? null) : null);
const day = (value: string | undefined) => (value !== undefined && isCalendarDay(value) ? value : null);
const LIST_SEPARATOR = ',';

export interface DayRange {
  /** Cairo calendar days `YYYY-MM-DD`, inclusive. */
  readonly from: string | null;
  readonly to: string | null;
}

/** `from`/`to`; a range that ends before it starts loses its end. */
function parseRange(params: RawParams): DayRange {
  const from = day(single(params.from));
  const to = day(single(params.to));
  return { from, to: from !== null && to !== null && to < from ? null : to };
}

function setRange(query: URLSearchParams, range: DayRange) {
  if (range.from !== null) query.set('from', range.from);
  if (range.to !== null) query.set('to', range.to);
}

const rangeQuery = (range: DayRange) => ({
  ...(range.from === null ? {} : { 'createdAt[gte]': cairoDayBounds(range.from).start }),
  ...(range.to === null ? {} : { 'createdAt[lte]': cairoDayBounds(range.to).end }),
});

/** One account type with `[eq]`, several with `[in]`, none: every type. */
function accountTypeQuery(types: readonly AccountType[]) {
  const [first] = types;
  if (types.length === 1 && first !== undefined) return { 'accountType[eq]': first };
  return types.length === 0 ? {} : { 'accountType[in]': inValues(types) };
}

/** One entry type with `[eq]`, several with `[in]`, none: every type. */
function entryTypeQuery(types: readonly LedgerEntryType[]) {
  const [first] = types;
  if (types.length === 1 && first !== undefined) return { 'entryType[eq]': first };
  return types.length === 0 ? {} : { 'entryType[in]': inValues(types) };
}

// ---------------------------------------------------------------- AD-18 accounts

/** Spec 03 AD-18 tabs, in order (Release 2 adds seller pending, customer refunds, promotions); the URL value is the key. */
export const ACCOUNT_TABS = {
  seller_payable: ['seller_payable'],
  seller_pending: ['seller_pending'],
  agent_fee_payable: ['agent_fee_payable'],
  agent_cod_cash: ['agent_cod_cash'],
  customer_refund_payable: ['customer_refund_payable'],
  platform: ['platform_commission_revenue', 'platform_delivery_revenue'],
  platform_promotions: ['platform_promotions'],
  all: [],
} as const satisfies Readonly<Record<string, readonly AccountType[]>>;

export type AccountTab = keyof typeof ACCOUNT_TABS;
export const ACCOUNT_SORTS = { balance: '-balance', updated: '-updatedAt' } as const;
export type AccountSort = keyof typeof ACCOUNT_SORTS;

export interface AccountFilters {
  readonly tab: AccountTab;
  readonly nonZero: boolean;
  readonly ownerId: string | null;
  readonly sort: AccountSort;
}

export const ACCOUNT_PARAMS = { type: 'type', nonZero: 'nonzero', owner: 'owner', sort: 'sort' } as const;
const NON_ZERO = '1';

export function parseAccountFilters(params: RawParams): AccountFilters {
  const tab = single(params[ACCOUNT_PARAMS.type]);
  const sort = single(params[ACCOUNT_PARAMS.sort]);
  return {
    // No tab is the first one, Sellers (spec 03 AD-18 order).
    tab: tab !== undefined && Object.hasOwn(ACCOUNT_TABS, tab) ? (tab as AccountTab) : 'seller_payable',
    nonZero: single(params[ACCOUNT_PARAMS.nonZero]) === NON_ZERO,
    ownerId: uuid(single(params[ACCOUNT_PARAMS.owner])),
    sort: sort !== undefined && Object.hasOwn(ACCOUNT_SORTS, sort) ? (sort as AccountSort) : 'balance',
  };
}

export function accountFiltersQuery(filters: AccountFilters): string {
  const query = new URLSearchParams();
  if (filters.tab !== 'seller_payable') query.set(ACCOUNT_PARAMS.type, filters.tab);
  if (filters.nonZero) query.set(ACCOUNT_PARAMS.nonZero, NON_ZERO);
  if (filters.ownerId !== null) query.set(ACCOUNT_PARAMS.owner, filters.ownerId);
  if (filters.sort !== 'balance') query.set(ACCOUNT_PARAMS.sort, filters.sort);
  return query.toString();
}

export function accountApiQuery(filters: AccountFilters) {
  return {
    sort: ACCOUNT_SORTS[filters.sort],
    ...accountTypeQuery(ACCOUNT_TABS[filters.tab]),
    ...(filters.nonZero ? { 'balance[gt]': '0' } : {}),
    ...(filters.ownerId === null ? {} : { 'ownerId[eq]': filters.ownerId }),
  };
}

// ---------------------------------------------------------------- AD-19 statement

export interface EntryFilters extends DayRange {
  /** Empty = every type; kept in `LEDGER_ENTRY_TYPES` order so equal filters give equal keys. */
  readonly types: readonly LedgerEntryType[];
}

export function parseEntryFilters(params: RawParams): EntryFilters {
  const types = new Set(single(params.type)?.split(LIST_SEPARATOR) ?? []);
  return { types: LEDGER_ENTRY_TYPES.filter((type) => types.has(type)), ...parseRange(params) };
}

export function entryFiltersQuery(filters: EntryFilters): string {
  const query = new URLSearchParams();
  if (filters.types.length > 0) query.set('type', filters.types.join(LIST_SEPARATOR));
  setRange(query, filters);
  return query.toString();
}

export function entryApiQuery(filters: EntryFilters) {
  return {
    sort: '-createdAt' as const,
    ...entryTypeQuery(filters.types),
    ...rangeQuery(filters),
  };
}

// ---------------------------------------------------------------- AD-20 remittances

export interface RemittanceFilters extends DayRange {
  readonly agentId: string | null;
}

export function parseRemittanceFilters(params: RawParams): RemittanceFilters {
  return { agentId: uuid(single(params.agent)), ...parseRange(params) };
}

export function remittanceFiltersQuery(filters: RemittanceFilters): string {
  const query = new URLSearchParams();
  if (filters.agentId !== null) query.set('agent', filters.agentId);
  setRange(query, filters);
  return query.toString();
}

export const remittanceApiQuery = (filters: RemittanceFilters) => ({
  sort: '-createdAt' as const,
  ...(filters.agentId === null ? {} : { 'agentId[eq]': filters.agentId }),
  ...rangeQuery(filters),
});

// ---------------------------------------------------------------- AD-21 payouts

export const PAYEE_TYPES = ['seller', 'agent'] as const;
export type PayeeType = (typeof PAYEE_TYPES)[number];

export interface PayoutFilters extends DayRange {
  /** null = Sellers and agents (the All tab). */
  readonly payeeType: PayeeType | null;
  /** Only with a payee type: an id means nothing without it. */
  readonly payeeId: string | null;
}

export function parsePayoutFilters(params: RawParams): PayoutFilters {
  const type = single(params.payeeType);
  const payeeType = (PAYEE_TYPES as readonly string[]).includes(type ?? '') ? (type as PayeeType) : null;
  return {
    payeeType,
    payeeId: payeeType === null ? null : uuid(single(params.payeeId)),
    ...parseRange(params),
  };
}

export function payoutFiltersQuery(filters: PayoutFilters): string {
  const query = new URLSearchParams();
  if (filters.payeeType !== null) query.set('payeeType', filters.payeeType);
  if (filters.payeeId !== null) query.set('payeeId', filters.payeeId);
  setRange(query, filters);
  return query.toString();
}

export const payoutApiQuery = (filters: PayoutFilters) => ({
  sort: '-createdAt' as const,
  ...(filters.payeeType === null ? {} : { 'payeeType[eq]': filters.payeeType }),
  ...(filters.payeeId === null ? {} : { 'payeeId[eq]': filters.payeeId }),
  ...rangeQuery(filters),
});

// ---------------------------------------------------------------- AD-22 lookup

export interface ReferenceQuery {
  readonly referenceType: LedgerReferenceType;
  readonly referenceId: string;
}

/** Both parts or nothing: the API requires both. */
export function parseReference(params: RawParams): ReferenceQuery | null {
  const type = single(params.referenceType);
  const id = uuid(single(params.referenceId));
  if (id === null || !(LEDGER_REFERENCE_TYPES as readonly string[]).includes(type ?? '')) return null;
  return { referenceType: type as LedgerReferenceType, referenceId: id };
}

export const referenceQueryString = (reference: ReferenceQuery): string =>
  new URLSearchParams({
    referenceType: reference.referenceType,
    referenceId: reference.referenceId,
  }).toString();
