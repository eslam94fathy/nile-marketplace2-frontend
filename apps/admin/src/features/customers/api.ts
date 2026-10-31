import { isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import { customerApiQuery, type CustomerFilters } from './lib/list-params';

// Customers (spec 03 AD-25, AD-26; design 02 §5.2 `customers.list`, `customers.detail`). Account actions come
// from features/users, which refreshes the `['admin', 'customers']` prefix after each.

export type AdminCustomer = Schema<'AdminCustomerDto'>;
export type AdminCustomerDetail = Schema<'AdminCustomerDetailDto'>;

const CUSTOMERS_PAGE_SIZE = 20;

export const customerKeys = {
  lists: () => queryKey('admin', 'customers', 'list'),
  list: (filters: CustomerFilters) => queryKey('admin', 'customers', 'list', filters),
  detail: (customerId: string) => queryKey('admin', 'customers', 'detail', { customerId }),
};

export function customersListOptions(filters: CustomerFilters) {
  return {
    ...infiniteListOptions({
      queryKey: customerKeys.list(filters),
      fetchPage: async (cursor, signal) =>
        unwrap(
          browserApi.GET('/api/v1/admin/customers', {
            params: {
              query: {
                limit: CUSTOMERS_PAGE_SIZE,
                ...customerApiQuery(filters),
                ...(cursor === undefined ? {} : { cursor }),
              },
            },
            signal,
          }),
        ),
    }),
    refetchOnWindowFocus: true,
  };
}

/** AD-26 (default stale time, design 02 §5.2). */
export function customerQuery(customerId: string) {
  return queryOptions({
    queryKey: customerKeys.detail(customerId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/customers/{customerId}', {
            params: { path: { customerId } },
            signal,
          }),
        )
      ).data,
  });
}

/** No such customer, or not a customer id at all (the backend checks the id format first, as R-36). */
export function isCustomerMissing(error: unknown): boolean {
  return isApiError(error, 'CUSTOMER_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}
