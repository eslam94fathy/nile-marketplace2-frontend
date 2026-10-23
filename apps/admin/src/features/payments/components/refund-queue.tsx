'use client';

import { isApiError } from '@nile/api';
import { REFUND_REASON_LABELS, REFUND_REASONS, type RefundStatus } from '@nile/domain';
import { buttonVariants, Checkbox, cn, EmptyState, ErrorState, Input, Label, PageHeader } from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { ROUTES } from '@/lib/routes';
import { refundsListOptions } from '../api';
import { PAYMENTS_COPY as COPY } from '../copy';
import {
  hasNarrowingFilters,
  parseRefundFilters,
  refundFiltersQuery,
  type RawRefundParams,
  type RefundFilters,
} from '../lib/list-params';
import { RefundsTable } from './refunds-table';

/** The manual queue only until the full refund list (spec 03 §7.3 AD-16, T-M8). */
const TABS = ['pending_manual', 'recorded'] as const satisfies readonly RefundStatus[];

const listHref = (filters: RefundFilters): Route => {
  const query = refundFiltersQuery(filters);
  return query === '' ? ROUTES.refunds : `${ROUTES.refunds}?${query}`;
};

export interface RefundQueueProps {
  readonly params: RawRefundParams;
  readonly currentUserId: string;
}

/** AD-16 Refund queue: To record (oldest first) / Recorded, reasons and created dates in the URL. */
export function RefundQueue({ params, currentUserId }: RefundQueueProps) {
  const filters = parseRefundFilters(params);
  const router = useRouter();
  const refunds = useInfiniteQuery(refundsListOptions(filters));
  const navigate = (next: RefundFilters, replace = false) => {
    if (replace) router.replace(listHref(next));
    else router.push(listHref(next));
  };

  let empty;
  if (hasNarrowingFilters(filters)) {
    empty = (
      <EmptyState
        title={COPY.emptyFiltered}
        action={
          <Link
            href={listHref({ ...filters, reasons: [], from: null, to: null })}
            className={buttonVariants({ variant: 'outline' })}
          >
            {COPY.clearFilters}
          </Link>
        }
      />
    );
  } else {
    empty = <EmptyState title={filters.status === 'pending_manual' ? COPY.emptyToRecord : COPY.empty} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.refundsTitle} />
      <nav aria-label={COPY.tabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {TABS.map((status) => {
            const current = status === filters.status;
            return (
              <li key={status}>
                <Link
                  href={listHref({ ...filters, status })}
                  aria-current={current ? 'page' : undefined}
                  className={cn(buttonVariants({ variant: current ? 'primary' : 'outline', size: 'sm' }))}
                >
                  {COPY.tabs[status]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {refunds.isError ? (
        <ErrorState
          message={COPY.listFailed}
          onRetry={() => void refunds.refetch()}
          correlationId={isApiError(refunds.error) ? (refunds.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <RefundsTable
          caption={COPY.refundsCaption}
          rows={refunds.data?.pages.flatMap((page) => page.data) ?? []}
          currentUserId={currentUserId}
          loading={refunds.isPending}
          hasMore={refunds.hasNextPage}
          loadingMore={refunds.isFetchingNextPage}
          onLoadMore={() => void refunds.fetchNextPage()}
          toolbar={<Filters filters={filters} onChange={navigate} />}
          empty={empty}
        />
      )}
    </div>
  );
}

interface FiltersProps {
  readonly filters: RefundFilters;
  readonly onChange: (next: RefundFilters, replace?: boolean) => void;
}

function Filters({ filters, onChange }: FiltersProps) {
  const id = useId();
  return (
    <div className="mb-4 space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{COPY.reasonFilter}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {REFUND_REASONS.map((reason) => {
            const checked = filters.reasons.includes(reason);
            return (
              <div key={reason} className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-${reason}`}
                  checked={checked}
                  onCheckedChange={(next) => {
                    const reasons = new Set(filters.reasons);
                    if (next === true) reasons.add(reason);
                    else reasons.delete(reason);
                    onChange({ ...filters, reasons: REFUND_REASONS.filter((item) => reasons.has(item)) });
                  }}
                />
                <Label htmlFor={`${id}-${reason}`} className="font-normal">
                  {REFUND_REASON_LABELS[reason]}
                </Label>
              </div>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
        <div className="space-y-1">
          <Label htmlFor={`${id}-from`}>{COPY.from}</Label>
          <Input
            id={`${id}-from`}
            type="date"
            value={filters.from ?? ''}
            max={filters.to ?? undefined}
            onChange={(event) => {
              onChange({ ...filters, from: event.target.value === '' ? null : event.target.value }, true);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-to`}>{COPY.to}</Label>
          <Input
            id={`${id}-to`}
            type="date"
            value={filters.to ?? ''}
            min={filters.from ?? undefined}
            onChange={(event) => {
              onChange({ ...filters, to: event.target.value === '' ? null : event.target.value }, true);
            }}
          />
        </div>
      </div>
    </div>
  );
}
