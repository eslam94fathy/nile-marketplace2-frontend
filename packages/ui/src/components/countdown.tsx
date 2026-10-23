'use client';

import { countdown } from '@nile/domain';
import { useEffect, useEffectEvent, useState } from 'react';
import { cn } from '../cn';

const TICK_MS = 1_000;

export interface CountdownProps {
  /** Server deadline (ISO), e.g. `paymentExpiresAt` or `acceptDeadlineAt`. */
  readonly deadline: string;
  /** Called once when it reaches zero; the screen refetches (conventions §8). */
  readonly onExpire?: () => void;
  /** Accessible name, e.g. "Time left to pay". */
  readonly label: string;
  readonly className?: string;
  /** Clock, for tests. */
  readonly now?: () => number;
}

/**
 * Ticks every second from the server deadline. Rendered as a `timer` that screen readers don't re-read on
 * every tick (`aria-live="off"`); its label says what the time is for.
 */
export function Countdown({ deadline, onExpire, label, className, now = Date.now }: CountdownProps) {
  const [state, setState] = useState(() => countdown(deadline, now()));
  const expire = useEffectEvent(() => onExpire?.());

  useEffect(() => {
    let expired = false;
    const tick = () => {
      const next = countdown(deadline, now());
      setState(next);
      if (next.expired && !expired) {
        expired = true;
        expire();
      }
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [deadline, now]);

  return (
    <span
      role="timer"
      aria-live="off"
      aria-label={`${label}: ${state.label}`}
      className={cn('tabular-nums', className)}
    >
      {state.label}
    </span>
  );
}
