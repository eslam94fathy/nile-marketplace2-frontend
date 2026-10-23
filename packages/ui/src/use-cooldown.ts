'use client';

import { useCallback, useEffect, useState } from 'react';

const TICK_MS = 1_000;

export interface Cooldown {
  /** Whole seconds left; 0 when the action is available. */
  readonly remaining: number;
  /** Starts (or restarts) the cooldown. */
  readonly start: (seconds: number) => void;
}

/**
 * A per-action wait, e.g. "Resend code" for 60 s or `RATE_LIMITED` for `Retry-After` seconds (conventions §4).
 * Counted from a deadline, so a throttled background tab still shows the right value when it wakes up.
 */
export function useCooldown(now: () => number = Date.now): Cooldown {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (deadline === null) return undefined;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - now()) / TICK_MS));
      setRemaining(left);
      if (left === 0) setDeadline(null);
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [deadline, now]);

  const start = useCallback(
    (seconds: number) => {
      setDeadline(now() + Math.max(0, seconds) * TICK_MS);
    },
    [now],
  );

  return { remaining, start };
}
