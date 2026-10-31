'use client';

import { isApiError } from '@nile/api';
import { formatDate, RETURN_STATUS_LABELS } from '@nile/domain';
import {
  buttonVariants,
  EmptyState,
  ErrorState,
  LoadingRegion,
  LoadMore,
  Money,
  PageHeader,
  RETURN_STATUS_TONES,
  Skeleton,
  StatusBadge,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { returnPath, ROUTES } from '@/lib/routes';
import { returnsListOptions, type Return, type ReturnsTab } from '../api';
import { RETURNS_COPY as COPY } from '../copy';
import { RETURNS_TABS as TABS } from '../lib/returns-tabs';

const SKELETON_ROWS = 3;

function Row({ data }: { readonly data: Return }) {
  const count = data.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <article className="relative flex flex-wrap items-start justify-between gap-3 py-4 hover:bg-muted/50">
      <div className="space-y-1 text-sm">
        <h2 className="text-base font-medium">
          <Link href={returnPath(data.id)} className="after:absolute after:inset-0 after:content-['']">
            {COPY.returnLabel(data.returnNumber)}
          </Link>
        </h2>
        <p className="text-muted-foreground">
          {COPY.order(data.orderNumber)} · {COPY.items(count)} · {COPY.requested(formatDate(data.createdAt))}
        </p>
        <StatusBadge value={data.status} labels={RETURN_STATUS_LABELS.customer} tones={RETURN_STATUS_TONES} />
      </div>
      <p className="text-end text-sm">
        {/* The API's amount; "Estimated" until the return is completed (conventions §12.9). */}
        <Money value={data.refund?.amount ?? data.refundAmount} className="font-semibold" />
        {data.status === 'completed' ? null : (
          <span className="block text-muted-foreground">{COPY.estimated}</span>
        )}
      </p>
    </article>
  );
}

/** SF-27 Returns: open / closed tabs in the URL (`?status=`), newest first, 20 per page. */
export function ReturnsList({ tab }: { readonly tab: ReturnsTab }) {
  const returns = useInfiniteQuery(returnsListOptions(tab));
  let body;
  if (returns.isPending) {
    body = (
      <LoadingRegion className="space-y-3">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </LoadingRegion>
    );
  } else if (returns.isError) {
    body = (
      <ErrorState
        message={COPY.loadFailed}
        onRetry={() => void returns.refetch()}
        retrying={returns.isFetching}
        correlationId={isApiError(returns.error) ? (returns.error.correlationId ?? undefined) : undefined}
      />
    );
  } else {
    const rows = returns.data.pages.flatMap((page) => page.data);
    body =
      rows.length === 0 ? (
        <EmptyState title={COPY.empty} />
      ) : (
        <div>
          <ul className="divide-y divide-border">
            {rows.map((data) => (
              <li key={data.id}>
                <Row data={data} />
              </li>
            ))}
          </ul>
          <LoadMore
            hasMore={returns.hasNextPage}
            loading={returns.isFetchingNextPage}
            loadedCount={rows.length}
            onLoadMore={() => void returns.fetchNextPage()}
          />
        </div>
      );
  }
  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      <nav aria-label={COPY.tabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {TABS.map((key) => (
            <li key={key}>
              <Link
                href={{ pathname: ROUTES.returns, query: { status: key } }}
                aria-current={key === tab ? 'page' : undefined}
                className={buttonVariants({ variant: key === tab ? 'primary' : 'outline', size: 'sm' })}
              >
                {COPY.tabs[key]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {body}
    </div>
  );
}
