'use client';

import { ApiError } from '@nile/api';
import { toast } from '@nile/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
  type UserNotification,
} from './api';
import { useNotificationsConfig } from './config';
import { NOTIFICATIONS_COPY } from './copy';

/** Relative times move on while a list stays open. */
const NOW_TICK_MS = 60_000;

/** The client clock, refreshed every minute, for relative times (set after mount, never during render). */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, NOW_TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  return now;
}

/** Mark one / all as read; afterwards the count, the bell and every list are read again. */
export function useNotificationActions() {
  const { api, scope } = useNotificationsConfig();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKeys(scope).all() });

  const markRead = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(api, notificationId),
    // A notification gone meanwhile (NOTIFICATION_NOT_FOUND, retention) simply disappears on the refetch.
    onSettled: refresh,
  });

  const markAllRead = useMutation({
    mutationFn: () => markAllNotificationsRead(api),
    onSuccess: refresh,
    onError: (error) => {
      toast({
        title: NOTIFICATIONS_COPY.markAllFailed,
        tone: 'destructive',
        correlationId: error instanceof ApiError ? (error.correlationId ?? undefined) : undefined,
      });
    },
  });

  /** Selecting a notification marks it read (spec 00 §12.4); its link, if any, navigates by itself. */
  const select = (notification: UserNotification) => {
    if (!notification.read) markRead.mutate(notification.id);
  };

  return { select, markAllRead };
}
