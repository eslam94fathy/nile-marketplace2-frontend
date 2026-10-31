import { fields } from '@nile/domain';

// AD-25 filters, URL ⇄ API: `?name=&phone=`, newest first. `name[like]` matches inside "first last" (contains,
// [VERIFIED backend customer.repository]); `phone[eq]` is a full E.164 number. Invalid values are dropped, never
// sent (R-28).

export const CUSTOMER_LIST_PARAMS = { name: 'name', phone: 'phone' } as const;

/** First and last names are at most 100 characters each [VERIFIED OpenAPI], so "first last" is at most 201. */
export const CUSTOMER_NAME_FILTER_MAX = 201;

export interface CustomerFilters {
  readonly name: string | null;
  /** E.164 (`+201012345678`). */
  readonly phone: string | null;
}

export type RawCustomerParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

export function parseCustomerFilters(params: RawCustomerParams): CustomerFilters {
  const name = single(params[CUSTOMER_LIST_PARAMS.name])?.trim();
  const phone = single(params[CUSTOMER_LIST_PARAMS.phone])?.trim();
  return {
    name: name !== undefined && name.length >= 1 && name.length <= CUSTOMER_NAME_FILTER_MAX ? name : null,
    phone: phone !== undefined && fields.EG_MOBILE_PATTERN.test(phone) ? phone : null,
  };
}

/** The query string for filters (no `?`). */
export function customerFiltersQuery(filters: CustomerFilters): string {
  const query = new URLSearchParams();
  if (filters.name !== null) query.set(CUSTOMER_LIST_PARAMS.name, filters.name);
  if (filters.phone !== null) query.set(CUSTOMER_LIST_PARAMS.phone, filters.phone);
  return query.toString();
}

/** The API query (literal filter keys), newest first (spec 03 AD-25). */
export function customerApiQuery(filters: CustomerFilters) {
  return {
    sort: '-createdAt' as const,
    ...(filters.name === null ? {} : { 'name[like]': filters.name }),
    ...(filters.phone === null ? {} : { 'phone[eq]': filters.phone }),
  };
}

export const hasCustomerFilters = (filters: CustomerFilters): boolean =>
  filters.name !== null || filters.phone !== null;

export const NO_CUSTOMER_FILTERS: CustomerFilters = { name: null, phone: null };
