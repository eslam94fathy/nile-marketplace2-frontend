'use client';

import { useRealtimeConnected } from '@nile/realtime';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingRegion,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
} from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useId, useState } from 'react';
import { latestNotificationsQuery, unreadCountQuery } from '../api';
import { useNotificationActions, useNow } from '../actions';
import { useNotificationsConfig } from '../config';
import { NOTIFICATIONS_COPY } from '../copy';
import { NotificationItem } from './notification-item';
import { PushPromptCard } from './push-prompt-card';

const FOOTER_LINK = 'rounded-md px-2 py-1 text-sm font-medium text-primary hover:underline';

function BellPanel({ unread, onClose }: { readonly unread: number; readonly onClose: () => void }) {
  const { api, scope, routes, Link, pushCardText } = useNotificationsConfig();
  const latest = useQuery(latestNotificationsQuery(api, scope));
  const { select, markAllRead } = useNotificationActions();
  const now = useNow();
  const headingId = useId();

  let body;
  if (latest.isPending) {
    body = (
      <LoadingRegion className="space-y-3 p-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </LoadingRegion>
    );
  } else if (latest.isError) {
    body = <ErrorState className="m-4" onRetry={() => void latest.refetch()} retrying={latest.isFetching} />;
  } else if (latest.data.length === 0) {
    body = <EmptyState title={NOTIFICATIONS_COPY.empty} />;
  } else {
    body = (
      <ul aria-labelledby={headingId} className="max-h-96 divide-y divide-border overflow-y-auto">
        {latest.data.map((notification) => (
          <li key={notification.id}>
            <NotificationItem
              notification={notification}
              now={now}
              onSelect={(selected) => {
                select(selected);
                onClose();
              }}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 id={headingId} className="font-semibold">
          {NOTIFICATIONS_COPY.title}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={unread === 0}
          loading={markAllRead.isPending}
          onClick={() => {
            markAllRead.mutate();
          }}
        >
          {NOTIFICATIONS_COPY.markAllRead}
        </Button>
      </div>
      {pushCardText === null ? null : <PushPromptCard text={pushCardText} className="m-3 mb-0" />}
      {body}
      <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-2">
        <Link href={routes.list} className={FOOTER_LINK} onClick={onClose}>
          {NOTIFICATIONS_COPY.seeAll}
        </Link>
        <Link href={routes.settings} className={FOOTER_LINK} onClick={onClose}>
          {NOTIFICATIONS_COPY.settings}
        </Link>
      </div>
    </div>
  );
}

/**
 * The header bell (spec 00 §12.4): unread count (live through `notification.created`, polled every 60 s while
 * no socket is connected) and a panel with the 10 newest. Render it only for a signed-in user.
 */
export function NotificationBell() {
  const { api, scope } = useNotificationsConfig();
  const connected = useRealtimeConnected();
  const count = useQuery(unreadCountQuery(api, scope, !connected));
  const [open, setOpen] = useState(false);
  const unread = count.data ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            count.data === undefined ? NOTIFICATIONS_COPY.title : NOTIFICATIONS_COPY.bellLabel(unread)
          }
        >
          <Bell aria-hidden="true" />
          {unread === 0 ? null : (
            <span
              aria-hidden="true"
              className="absolute end-0.5 top-0.5 min-w-5 rounded-full bg-primary px-1 text-center text-xs leading-5 font-semibold text-primary-foreground"
            >
              {NOTIFICATIONS_COPY.badge(unread)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={NOTIFICATIONS_COPY.title}>
        <BellPanel
          unread={unread}
          onClose={() => {
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
