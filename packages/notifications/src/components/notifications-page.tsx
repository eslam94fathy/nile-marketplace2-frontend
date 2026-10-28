'use client';

import { NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_LABELS } from '@nile/domain';
import { Button, cn, EmptyState, ErrorState, LoadingRegion, LoadMore, PageHeader, Skeleton } from '@nile/ui';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { notificationsListOptions, type NotificationFilter } from '../api';
import { useNotificationActions, useNow } from '../actions';
import { useNotificationsConfig } from '../config';
import { NOTIFICATIONS_COPY } from '../copy';
import { notificationsHref } from '../filter';
import { NotificationItem } from './notification-item';

const CHIP =
  'inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium aria-[current=true]:border-primary aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground border-input hover:bg-muted aria-[current=true]:hover:bg-primary';

function FilterChips({ filter }: { readonly filter: NotificationFilter }) {
  const { routes, Link } = useNotificationsConfig();
  const shows = [
    { label: NOTIFICATIONS_COPY.filters.all, unreadOnly: false },
    { label: NOTIFICATIONS_COPY.filters.unread, unreadOnly: true },
  ] as const;
  const categories = [
    { label: NOTIFICATIONS_COPY.filters.allCategories, category: null },
    ...NOTIFICATION_CATEGORIES.map((category) => ({
      label: NOTIFICATION_CATEGORY_LABELS[category],
      category,
    })),
  ];
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={NOTIFICATIONS_COPY.filters.label} className="flex flex-wrap gap-2">
        {shows.map(({ label, unreadOnly }) => (
          <li key={label}>
            <Link
              href={notificationsHref(routes.list, { ...filter, unreadOnly })}
              className={CHIP}
              {...(filter.unreadOnly === unreadOnly ? { 'aria-current': 'true' as const } : {})}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
      <ul aria-label={NOTIFICATIONS_COPY.filters.categoryLabel} className="flex flex-wrap gap-2">
        {categories.map(({ label, category }) => (
          <li key={label}>
            <Link
              href={notificationsHref(routes.list, { ...filter, category })}
              className={CHIP}
              {...(filter.category === category ? { 'aria-current': 'true' as const } : {})}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface NotificationsPageProps {
  /** From the URL (`parseNotificationFilter`). */
  readonly filter: NotificationFilter;
}

/** SF-32 / SE-27 / AD-40 / AG-09 (spec 00 §12.4): filters, the list with "Load more", mark all as read. */
export function NotificationsPage({ filter }: NotificationsPageProps) {
  const { api, scope, routes, Link } = useNotificationsConfig();
  const list = useInfiniteQuery({
    ...notificationsListOptions(api, scope, filter),
    placeholderData: keepPreviousData,
  });
  const { select, markAllRead } = useNotificationActions();
  const now = useNow();
  const items = list.data?.pages.flatMap((page) => page.data) ?? [];

  let body;
  if (list.isPending) {
    body = (
      <LoadingRegion className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </LoadingRegion>
    );
  } else if (list.isError) {
    body = <ErrorState onRetry={() => void list.refetch()} retrying={list.isFetching} />;
  } else if (items.length === 0) {
    body = (
      <EmptyState title={filter.unreadOnly ? NOTIFICATIONS_COPY.emptyUnread : NOTIFICATIONS_COPY.empty} />
    );
  } else {
    body = (
      <>
        <ul
          aria-label={NOTIFICATIONS_COPY.title}
          className={cn(
            'divide-y divide-border rounded-lg border border-border',
            // Previous results stay visible, dimmed, while a filter change loads (R-28).
            list.isPlaceholderData && 'opacity-60',
          )}
        >
          {items.map((notification) => (
            <li key={notification.id}>
              <NotificationItem notification={notification} now={now} onSelect={select} />
            </li>
          ))}
        </ul>
        <LoadMore
          hasMore={list.hasNextPage}
          loading={list.isFetchingNextPage}
          onLoadMore={() => void list.fetchNextPage()}
          loadedCount={items.length}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={NOTIFICATIONS_COPY.title}
        actions={
          <>
            <Button
              variant="outline"
              loading={markAllRead.isPending}
              onClick={() => {
                markAllRead.mutate();
              }}
            >
              {NOTIFICATIONS_COPY.markAllRead}
            </Button>
            <Link
              href={routes.settings}
              className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-primary hover:underline"
            >
              {NOTIFICATIONS_COPY.settings}
            </Link>
          </>
        }
      />
      <FilterChips filter={filter} />
      {body}
    </div>
  );
}
