'use client';

import { isApiError } from '@nile/api';
import { fields, formatDate, USER_STATUS_LABELS } from '@nile/domain';
import {
  buttonVariants,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Label,
  PageHeader,
  PhoneInput,
  StatusBadge,
  USER_STATUS_TONES,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { customerPath, ROUTES } from '@/lib/routes';
import { customersListOptions, type AdminCustomer } from '../api';
import { CUSTOMERS_COPY as COPY, fullName } from '../copy';
import {
  CUSTOMER_NAME_FILTER_MAX,
  customerFiltersQuery,
  hasCustomerFilters,
  NO_CUSTOMER_FILTERS,
  parseCustomerFilters,
  type CustomerFilters,
  type RawCustomerParams,
} from '../lib/list-params';

/** As AD-04's name search: typed filters wait for a pause in typing. */
export const CUSTOMER_SEARCH_DEBOUNCE_MS = 400;

const listHref = (filters: CustomerFilters): Route => {
  const query = customerFiltersQuery(filters);
  return query === '' ? ROUTES.customers : `${ROUTES.customers}?${query}`;
};

/** The digits typed after `+20` as E.164, `null` when empty, `undefined` while not a whole number yet. */
function typedPhone(digits: string): string | null | undefined {
  if (digits.trim() === '') return null;
  const parsed = fields.egPhone.safeParse(digits);
  return parsed.success ? parsed.data : undefined;
}

/** AD-25 Customers: name (contains) and whole phone number searches in the URL, newest first → AD-26. */
export function CustomersList({ params }: { readonly params: RawCustomerParams }) {
  const filters = parseCustomerFilters(params);
  const router = useRouter();
  const customers = useInfiniteQuery(customersListOptions(filters));

  const columns: readonly DataTableColumn<AdminCustomer>[] = [
    {
      id: 'name',
      header: COPY.columns.name,
      cell: (customer) => (
        <Link
          href={customerPath(customer.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {fullName(customer)}
        </Link>
      ),
    },
    { id: 'email', header: COPY.columns.email, cell: (customer) => customer.email },
    { id: 'phone', header: COPY.columns.phone, cell: (customer) => customer.phone },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (customer) => (
        <StatusBadge value={customer.userStatus} labels={USER_STATUS_LABELS} tones={USER_STATUS_TONES} />
      ),
    },
    { id: 'created', header: COPY.columns.created, cell: (customer) => formatDate(customer.createdAt) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      {customers.isError ? (
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void customers.refetch()}
          correlationId={
            isApiError(customers.error) ? (customers.error.correlationId ?? undefined) : undefined
          }
        />
      ) : (
        <DataTable
          caption={COPY.caption}
          columns={columns}
          rows={customers.data?.pages.flatMap((page) => page.data) ?? []}
          getRowId={(customer) => customer.id}
          loading={customers.isPending}
          hasMore={customers.hasNextPage}
          loadingMore={customers.isFetchingNextPage}
          onLoadMore={() => void customers.fetchNextPage()}
          toolbar={
            <Filters
              filters={filters}
              onChange={(next) => {
                router.replace(listHref(next));
              }}
            />
          }
          empty={
            hasCustomerFilters(filters) ? (
              <EmptyState
                title={COPY.emptyFiltered}
                action={
                  <Link
                    href={listHref(NO_CUSTOMER_FILTERS)}
                    className={buttonVariants({ variant: 'outline' })}
                  >
                    {COPY.clearFilters}
                  </Link>
                }
              />
            ) : (
              <EmptyState title={COPY.empty} />
            )
          }
        />
      )}
    </div>
  );
}

interface FiltersProps {
  readonly filters: CustomerFilters;
  readonly onChange: (next: CustomerFilters) => void;
}

function Filters({ filters, onChange }: FiltersProps) {
  const nameId = useId();
  const phoneId = useId();
  const phoneHintId = useId();
  const [name, setName] = useState(filters.name ?? '');
  const [phone, setPhone] = useState(filters.phone === null ? '' : fields.toLocalPhone(filters.phone));

  // The URL changed from elsewhere (Back, "Clear filters"): show its values (adjusted while rendering).
  const [url, setUrl] = useState(filters);
  if (url.name !== filters.name || url.phone !== filters.phone) {
    setUrl(filters);
    if (name.trim() !== (filters.name ?? '')) setName(filters.name ?? '');
    if (typedPhone(phone) !== filters.phone)
      setPhone(filters.phone === null ? '' : fields.toLocalPhone(filters.phone));
  }

  // The latest filters and callback, read when the timer fires: re-renders must not restart it.
  const latest = useRef({ filters, onChange });
  useEffect(() => {
    latest.current = { filters, onChange };
  });

  useEffect(() => {
    const trimmed = name.trim();
    const nextName = trimmed === '' ? null : trimmed;
    // A partly typed number changes nothing: only a whole number (or none) is searched.
    const nextPhone = typedPhone(phone);
    const phoneChanged = nextPhone !== undefined && nextPhone !== filters.phone;
    if (nextName === filters.name && !phoneChanged) return undefined;
    const timer = setTimeout(() => {
      const current = latest.current.filters;
      latest.current.onChange({
        ...current,
        name: nextName,
        phone: nextPhone === undefined ? current.phone : nextPhone,
      });
    }, CUSTOMER_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [name, phone, filters.name, filters.phone]);

  return (
    <div className="mb-4 grid gap-4 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor={nameId}>{COPY.nameFilter}</Label>
        <Input
          id={nameId}
          type="search"
          autoComplete="off"
          value={name}
          maxLength={CUSTOMER_NAME_FILTER_MAX}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={phoneId}>{COPY.phoneFilter}</Label>
        <PhoneInput
          id={phoneId}
          autoComplete="off"
          value={phone}
          aria-describedby={phoneHintId}
          onChange={(event) => {
            setPhone(event.target.value);
          }}
        />
        <p id={phoneHintId} className="text-sm text-muted-foreground">
          {COPY.phoneHint}
        </p>
      </div>
    </div>
  );
}
