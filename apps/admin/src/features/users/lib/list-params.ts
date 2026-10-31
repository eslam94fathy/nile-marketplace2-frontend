import {
  cairoDayBounds,
  isCalendarDay,
  USER_ROLES,
  USER_STATUSES,
  type UserRole,
  type UserStatus,
} from '@nile/domain';

// AD-24 filters, URL ⇄ API: `?role=&status=&email=&from=&to=`, newest first. Invalid values are dropped, never
// sent (R-28). The email filter is a prefix, case-insensitive [SPEC 20 §3.3].

export const USER_LIST_PARAMS = {
  role: 'role',
  status: 'status',
  email: 'email',
  from: 'from',
  to: 'to',
} as const;

/** An email is at most 254 characters, so a longer prefix can't match. */
export const EMAIL_FILTER_MAX = 254;

export interface UserFilters {
  readonly role: UserRole | null;
  readonly status: UserStatus | null;
  /** Email prefix (`email[like]`). */
  readonly email: string | null;
  /** Cairo calendar days `YYYY-MM-DD`, inclusive. */
  readonly from: string | null;
  readonly to: string | null;
}

export type RawUserParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const day = (value: string | undefined) => (value !== undefined && isCalendarDay(value) ? value : null);
const oneOf = <T extends string>(values: readonly T[], value: string | undefined): T | null =>
  values.find((candidate) => candidate === value) ?? null;

export function parseUserFilters(params: RawUserParams): UserFilters {
  const email = single(params[USER_LIST_PARAMS.email])?.trim();
  const from = day(single(params[USER_LIST_PARAMS.from]));
  const to = day(single(params[USER_LIST_PARAMS.to]));
  return {
    role: oneOf(USER_ROLES, single(params[USER_LIST_PARAMS.role])),
    status: oneOf(USER_STATUSES, single(params[USER_LIST_PARAMS.status])),
    email: email !== undefined && email.length >= 1 && email.length <= EMAIL_FILTER_MAX ? email : null,
    from,
    // A range that ends before it starts is dropped as a whole end.
    to: from !== null && to !== null && to < from ? null : to,
  };
}

/** The query string for filters (no `?`). */
export function userFiltersQuery(filters: UserFilters): string {
  const query = new URLSearchParams();
  if (filters.role !== null) query.set(USER_LIST_PARAMS.role, filters.role);
  if (filters.status !== null) query.set(USER_LIST_PARAMS.status, filters.status);
  if (filters.email !== null) query.set(USER_LIST_PARAMS.email, filters.email);
  if (filters.from !== null) query.set(USER_LIST_PARAMS.from, filters.from);
  if (filters.to !== null) query.set(USER_LIST_PARAMS.to, filters.to);
  return query.toString();
}

/** The API query (literal filter keys), newest first (spec 03 AD-24). */
export function userApiQuery(filters: UserFilters) {
  return {
    sort: '-createdAt' as const,
    ...(filters.role === null ? {} : { 'role[eq]': filters.role }),
    ...(filters.status === null ? {} : { 'status[eq]': filters.status }),
    ...(filters.email === null ? {} : { 'email[like]': filters.email }),
    ...(filters.from === null ? {} : { 'createdAt[gte]': cairoDayBounds(filters.from).start }),
    ...(filters.to === null ? {} : { 'createdAt[lte]': cairoDayBounds(filters.to).end }),
  };
}

export const hasUserFilters = (filters: UserFilters): boolean =>
  filters.role !== null ||
  filters.status !== null ||
  filters.email !== null ||
  filters.from !== null ||
  filters.to !== null;

export const NO_USER_FILTERS: UserFilters = { role: null, status: null, email: null, from: null, to: null };
