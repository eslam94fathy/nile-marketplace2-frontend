'use client';

import { REALTIME_SIGNALS } from '@nile/api';
import { useCallback, useEffect, useRef } from 'react';
import { useRealtimeConnection, useRealtimeStatus } from './provider';

// Client → server signals (backend docs/realtime.md "Signals", design 01 §15.3). Rooms are per socket, so the
// ticket on screen is subscribed again after every reconnect.

/** Ack retries for `INTERNAL_ERROR` / `RATE_LIMITED` / no answer: 1 s, 2 s, 4 s. */
export const TICKET_SUBSCRIBE_RETRIES = 3;
export const TICKET_SUBSCRIBE_RETRY_MS = 1_000;
/** One `support.typing` per 3 s while typing (the gateway allows 5 signals per second). */
export const TYPING_THROTTLE_MS = 3_000;

const ackCode = (ack: unknown): string | null => {
  if (typeof ack !== 'object' || ack === null) return null;
  const { ok, code } = ack as { ok?: unknown; code?: unknown };
  if (ok === true) return 'OK';
  return typeof code === 'string' ? code : null;
};

export interface TicketRoomOptions {
  /** `SUPPORT_TICKET_NOT_FOUND`: the thread refetches and shows not found. */
  readonly onNotFound?: () => void;
}

/** Joins the ticket's room while connected and mounted; leaves it on unmount or another ticket. */
export function useTicketRoom(ticketId: string | null, { onNotFound }: TicketRoomOptions = {}): void {
  const status = useRealtimeStatus();
  const connection = useRealtimeConnection();
  const notFound = useRef(onNotFound);
  useEffect(() => {
    notFound.current = onNotFound;
  });

  useEffect(() => {
    if (ticketId === null || status !== 'connected') return undefined;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const subscribe = (attempt: number) => {
      const current = connection();
      if (!active || current === null) return;
      current.emitWithAck(REALTIME_SIGNALS.ticketSubscribe, { ticketId }).then(
        (ack) => {
          if (!active) return;
          const code = ackCode(ack);
          if (code === 'OK') return;
          if (code === 'SUPPORT_TICKET_NOT_FOUND') {
            notFound.current?.();
            return;
          }
          if (code === 'VALIDATION_FAILED') return;
          retry(attempt);
        },
        () => {
          retry(attempt);
        },
      );
    };
    const retry = (attempt: number) => {
      if (!active || attempt >= TICKET_SUBSCRIBE_RETRIES) return;
      timer = setTimeout(
        () => {
          subscribe(attempt + 1);
        },
        TICKET_SUBSCRIBE_RETRY_MS * 2 ** attempt,
      );
    };
    subscribe(0);

    return () => {
      active = false;
      if (timer !== null) clearTimeout(timer);
      connection()?.emit(REALTIME_SIGNALS.ticketUnsubscribe, { ticketId });
    };
  }, [connection, status, ticketId]);
}

/** Returns `notifyTyping()`, sending `support.typing` at most once per 3 s for this ticket. */
export function useTypingSignal(ticketId: string | null, now: () => number = Date.now): () => void {
  const connection = useRealtimeConnection();
  const last = useRef<{ ticketId: string | null; at: number }>({ ticketId: null, at: -Infinity });
  return useCallback(() => {
    if (ticketId === null) return;
    const at = now();
    if (last.current.ticketId === ticketId && at - last.current.at < TYPING_THROTTLE_MS) return;
    last.current = { ticketId, at };
    connection()?.emit(REALTIME_SIGNALS.typing, { ticketId });
  }, [connection, now, ticketId]);
}
