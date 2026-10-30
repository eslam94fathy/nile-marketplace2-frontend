'use client';

import { useEffect, useState } from 'react';

/** `setTimeout` treats longer delays (about 24.8 days) as 1 ms, so long waits are taken in steps. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * True from `atMs` on; re-renders the screen when that moment arrives (a deadline, a return window). Reading
 * the clock in a hook keeps rendering pure. `NaN` or `Infinity` never passes.
 */
export function usePassed(atMs: number): boolean {
  const [passed, setPassed] = useState(() => Number.isFinite(atMs) && Date.now() >= atMs);
  useEffect(() => {
    if (!Number.isFinite(atMs)) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    const wait = () => {
      const left = atMs - Date.now();
      if (left <= 0) {
        setPassed(true);
        return;
      }
      setPassed(false);
      timer = setTimeout(wait, Math.min(left, MAX_TIMEOUT_MS));
    };
    wait();
    return () => {
      clearTimeout(timer);
    };
  }, [atMs]);
  return passed;
}
