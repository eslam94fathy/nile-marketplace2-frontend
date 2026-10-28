import { type ApiClient, type components, isApiError, unwrap } from '@nile/api';
import { MEDIA_POLL_FIRST_DELAY_MS, MEDIA_POLL_MAX_DELAY_MS } from './limits';

export type MediaDto = components['schemas']['MediaDto'];

export interface WaitForMediaOptions {
  readonly signal?: AbortSignal;
  /**
   * Wakes the wait early (the realtime `media.updated` message, T-J5): returns an unsubscribe function. Without
   * it, polling alone decides.
   */
  readonly subscribe?: (mediaId: string, onUpdate: () => void) => () => void;
}

const abortError = () => new DOMException('The wait was cancelled.', 'AbortError');

/** Resolves after `ms`, or earlier on `wake`; rejects on abort. */
function pause(
  ms: number,
  signal: AbortSignal | undefined,
  wake: { notify?: (() => void) | undefined },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      wake.notify = undefined;
      resolve();
    };
    const onAbort = () => {
      clearTimeout(timer);
      wake.notify = undefined;
      reject(abortError());
    };
    const timer = setTimeout(done, ms);
    wake.notify = done;
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Polling runs only while the tab is visible (CLAUDE.md §5). */
function whenVisible(signal: AbortSignal | undefined): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onChange = () => {
      if (document.visibilityState === 'hidden') return;
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => {
      document.removeEventListener('visibilitychange', onChange);
      signal?.removeEventListener('abort', onAbort);
    };
    document.addEventListener('visibilitychange', onChange);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** A failed poll worth repeating: no answer, or the backend briefly unavailable. */
const isTransient = (error: unknown) =>
  isApiError(error) && (error.status === 0 || error.status >= 500 || error.code === 'RATE_LIMITED');

/**
 * Waits until an upload is `ready` or `failed` (design 01 §15.4): `GET /media/{id}` after 1 s, 2 s, 4 s … at most
 * 30 s apart. Transient failures keep polling; anything else (e.g. `MEDIA_NOT_FOUND`) rejects.
 */
export async function waitForMedia(
  api: ApiClient,
  mediaId: string,
  { signal, subscribe }: WaitForMediaOptions = {},
): Promise<MediaDto> {
  const wake: { notify?: (() => void) | undefined } = {};
  const unsubscribe = subscribe?.(mediaId, () => wake.notify?.());
  try {
    let delay = MEDIA_POLL_FIRST_DELAY_MS;
    for (;;) {
      await pause(delay, signal, wake);
      await whenVisible(signal);
      delay = Math.min(delay * 2, MEDIA_POLL_MAX_DELAY_MS);
      try {
        const { data } = await unwrap(
          api.GET('/api/v1/media/{mediaId}', {
            params: { path: { mediaId } },
            ...(signal === undefined ? {} : { signal }),
          }),
        );
        if (data.status === 'ready' || data.status === 'failed') return data;
      } catch (error) {
        if (!isTransient(error)) throw error;
      }
    }
  } finally {
    unsubscribe?.();
  }
}
