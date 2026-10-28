'use client';

import { formatRelativeTime, mapNotificationLink } from '@nile/domain';
import { cn } from '@nile/ui';
import type { UserNotification } from '../api';
import { useNotificationsConfig } from '../config';
import { NOTIFICATIONS_COPY } from '../copy';

const ROW =
  'flex w-full gap-3 px-4 py-3 text-start text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring';
const INTERACTIVE = 'hover:bg-muted';

export interface NotificationItemProps {
  readonly notification: UserNotification;
  readonly now: number;
  /** Marks it read (and closes the bell panel); a mapped link then navigates by itself. */
  readonly onSelect: (notification: UserNotification) => void;
}

/**
 * One notification (spec 00 §12.4): title, body, relative time and an unread dot named for screen readers.
 * A link of this app opens its page; any other link is shown without one and selecting it only marks it read.
 */
export function NotificationItem({ notification, now, onSelect }: NotificationItemProps) {
  const { linkMap, Link } = useNotificationsConfig();
  const href = mapNotificationLink(linkMap, notification.link);
  const content = (
    <>
      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0">
        {notification.read ? null : <span className="block size-2 rounded-full bg-primary" />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn('text-foreground', notification.read ? 'font-normal' : 'font-semibold')}>
          {notification.read ? null : <span className="sr-only">{`${NOTIFICATIONS_COPY.unread}: `}</span>}
          {notification.title}
        </span>
        <span className="text-muted-foreground">{notification.body}</span>
        <time dateTime={notification.createdAt} className="text-xs text-muted-foreground">
          {formatRelativeTime(notification.createdAt, now)}
        </time>
      </span>
    </>
  );
  const select = () => {
    onSelect(notification);
  };

  if (href !== null) {
    return (
      <Link href={href} className={cn(ROW, INTERACTIVE)} onClick={select}>
        {content}
      </Link>
    );
  }
  if (!notification.read) {
    return (
      <button type="button" className={cn(ROW, INTERACTIVE)} onClick={select}>
        {content}
      </button>
    );
  }
  return <div className={ROW}>{content}</div>;
}
