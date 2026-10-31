import { inValues } from '@nile/api';
import {
  cairoDayBounds,
  isCalendarDay,
  TICKET_CATEGORIES,
  type TicketCategory,
  type TicketStatus,
} from '@nile/domain';

// AD-28 views and filters, URL ⇄ API: `?view=&category=&opener=&from=&to=` (spec 03 AD-28, AD-Q-12). A view
// carries the status, assignment and SLA parts of the query; invalid values are dropped, never sent (R-28).

export const TICKET_LIST_PARAMS = {
  view: 'view',
  category: 'category',
  opener: 'opener',
  from: 'from',
  to: 'to',
} as const;

export const TICKET_VIEWS = [
  'waiting',
  'mine',
  'unassigned',
  'sla',
  'awaiting-user',
  'resolved',
  'closed',
  'all',
] as const;
export type TicketView = (typeof TICKET_VIEWS)[number];
export const DEFAULT_TICKET_VIEW: TicketView = 'waiting';

export const OPENER_ROLES = ['customer', 'seller'] as const;
export type OpenerRole = (typeof OPENER_ROLES)[number];

const WAITING: readonly TicketStatus[] = ['open', 'awaiting_admin'];
const MINE: readonly TicketStatus[] = ['open', 'awaiting_admin', 'awaiting_user', 'resolved'];

export interface TicketFilters {
  readonly view: TicketView;
  readonly category: TicketCategory | null;
  readonly opener: OpenerRole | null;
  /** Cairo calendar days `YYYY-MM-DD`, inclusive. */
  readonly from: string | null;
  readonly to: string | null;
}

export type RawTicketParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const day = (value: string | undefined) => (value !== undefined && isCalendarDay(value) ? value : null);
const oneOf = <T extends string>(values: readonly T[], value: string | undefined): T | null =>
  values.find((candidate) => candidate === value) ?? null;

export function parseTicketFilters(params: RawTicketParams): TicketFilters {
  const from = day(single(params[TICKET_LIST_PARAMS.from]));
  const to = day(single(params[TICKET_LIST_PARAMS.to]));
  return {
    view: oneOf(TICKET_VIEWS, single(params[TICKET_LIST_PARAMS.view])) ?? DEFAULT_TICKET_VIEW,
    category: oneOf(TICKET_CATEGORIES, single(params[TICKET_LIST_PARAMS.category])),
    opener: oneOf(OPENER_ROLES, single(params[TICKET_LIST_PARAMS.opener])),
    from,
    // A range that ends before it starts is dropped as a whole end.
    to: from !== null && to !== null && to < from ? null : to,
  };
}

/** The query string for filters (no `?`): the default view has no `view`. */
export function ticketFiltersQuery(filters: TicketFilters): string {
  const query = new URLSearchParams();
  if (filters.view !== DEFAULT_TICKET_VIEW) query.set(TICKET_LIST_PARAMS.view, filters.view);
  if (filters.category !== null) query.set(TICKET_LIST_PARAMS.category, filters.category);
  if (filters.opener !== null) query.set(TICKET_LIST_PARAMS.opener, filters.opener);
  if (filters.from !== null) query.set(TICKET_LIST_PARAMS.from, filters.from);
  if (filters.to !== null) query.set(TICKET_LIST_PARAMS.to, filters.to);
  return query.toString();
}

/** One view's part of the query (spec 03 AD-28 table); "Mine" needs the signed-in admin. */
function viewQuery(view: TicketView, currentUserId: string) {
  switch (view) {
    case 'waiting':
      return { 'status[in]': inValues(WAITING), sort: 'awaitingAdminSince' as const };
    case 'mine':
      return { 'assignedAdminId[eq]': currentUserId, 'status[in]': inValues(MINE) };
    case 'unassigned':
      return { 'assigned[eq]': false, 'status[in]': inValues(WAITING) };
    case 'sla':
      return { 'slaBreached[eq]': true };
    case 'awaiting-user':
      return { 'status[eq]': 'awaiting_user' as const };
    case 'resolved':
      return { 'status[eq]': 'resolved' as const };
    case 'closed':
      return { 'status[eq]': 'closed' as const };
    case 'all':
      return {};
  }
}

/** The API query (literal filter keys). Views without their own order show the latest activity first. */
export function ticketApiQuery(filters: TicketFilters, currentUserId: string) {
  return {
    sort: '-lastMessageAt' as const,
    ...viewQuery(filters.view, currentUserId),
    ...(filters.category === null ? {} : { 'category[eq]': filters.category }),
    ...(filters.opener === null ? {} : { 'openerRole[eq]': filters.opener }),
    ...(filters.from === null ? {} : { 'createdAt[gte]': cairoDayBounds(filters.from).start }),
    ...(filters.to === null ? {} : { 'createdAt[lte]': cairoDayBounds(filters.to).end }),
  };
}

export const hasTicketFilters = (filters: TicketFilters): boolean =>
  filters.category !== null || filters.opener !== null || filters.from !== null || filters.to !== null;
