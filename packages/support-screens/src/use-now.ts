'use client';

import { useEffect, useState } from 'react';

/** Relative times move on while a screen stays open. */
const NOW_TICK_MS = 60_000;

/** The client clock, refreshed every minute, for relative times (read in a hook, so rendering stays pure). */
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
