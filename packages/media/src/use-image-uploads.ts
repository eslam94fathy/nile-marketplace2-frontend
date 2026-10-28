'use client';

import type { ApiClient } from '@nile/api';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { checkImageFile, type DecodeImage, type FileRefusal } from './check-file';
import { ANNOUNCE_COPY, FAILURE_COPY, REFUSAL_COPY } from './copy';
import type { MediaContentType } from './limits';
import {
  type ImageDto,
  type MediaPurpose,
  RETRYABLE_FAILURES,
  UploadFailure,
  type UploadFailureKind,
  uploadImage,
} from './upload-image';
import type { WaitForMediaOptions } from './wait-for-media';

// Upload tiles for one form (conventions §12.2, FR2-Q9): each picked file is checked, then uploads at once with its
// own tile `checking → uploading(%) → processing → ready | failed`. The owning feature attaches the ready media
// ids in its own mutation (design 01 §15.4).

export type UploadTileStatus = 'checking' | 'uploading' | 'processing' | 'ready' | 'failed';

export interface UploadTile {
  readonly key: string;
  readonly fileName: string;
  /** Local preview (`blob:`), revoked when the tile goes. */
  readonly previewUrl: string;
  readonly status: UploadTileStatus;
  /** 0…100 while uploading. */
  readonly progress: number;
  readonly mediaId: string | null;
  readonly image: ImageDto | null;
  readonly failure: UploadFailureKind | null;
  /** Failure copy, `null` unless failed. */
  readonly message: string | null;
  readonly canRetry: boolean;
}

export interface FileRefusalNotice {
  readonly key: string;
  readonly fileName: string;
  readonly reason: FileRefusal | 'count';
  readonly message: string;
}

/** Local previews; replaceable in tests (jsdom has no `URL.createObjectURL`). */
export interface PreviewUrls {
  create(file: Blob): string;
  revoke(url: string): void;
}

const BROWSER_PREVIEWS: PreviewUrls = {
  create: (file) => URL.createObjectURL(file),
  revoke: (url) => {
    URL.revokeObjectURL(url);
  },
};

export interface UseImageUploadsOptions extends Pick<WaitForMediaOptions, 'subscribe'> {
  readonly api: ApiClient;
  readonly purpose: MediaPurpose;
  /** The screen's limit, counting every tile (e.g. 8 product images, 4 review images). */
  readonly max: number;
  /** `RATE_LIMITED` on an upload: the picker counts down `Retry-After` seconds (conventions §4). */
  readonly onRateLimited?: (seconds: number) => void;
  readonly decode?: DecodeImage;
  readonly previews?: PreviewUrls;
}

export interface ImageUploads {
  readonly tiles: readonly UploadTile[];
  readonly refusals: readonly FileRefusalNotice[];
  /** The latest status change, for a polite live region. */
  readonly announcement: string;
  /** Ready media ids in tile order: what the owner's mutation attaches. */
  readonly readyMediaIds: readonly string[];
  /** A tile is still checking, uploading or processing: submit waits. */
  readonly busy: boolean;
  readonly canAddMore: boolean;
  readonly add: (files: Iterable<File>) => void;
  readonly remove: (key: string) => void;
  readonly retry: (key: string) => void;
  /** `MEDIA_NOT_ATTACHABLE` on submit: the tiles of these ids must be uploaded again. */
  readonly markNotAttachable: (mediaIds: readonly string[]) => void;
  /** Drops every tile (after a successful submit). */
  readonly clear: () => void;
}

type Action =
  | { readonly type: 'add'; readonly tile: UploadTile }
  | { readonly type: 'patch'; readonly key: string; readonly patch: Partial<UploadTile> }
  | { readonly type: 'remove'; readonly key: string }
  | { readonly type: 'clear' };

function tilesReducer(tiles: readonly UploadTile[], action: Action): readonly UploadTile[] {
  switch (action.type) {
    case 'add':
      return [...tiles, action.tile];
    case 'patch':
      return tiles.map((tile) => (tile.key === action.key ? { ...tile, ...action.patch } : tile));
    case 'remove':
      return tiles.filter((tile) => tile.key !== action.key);
    case 'clear':
      return [];
  }
}

const failed = (kind: UploadFailureKind): Partial<UploadTile> => ({
  status: 'failed',
  failure: kind,
  message: FAILURE_COPY[kind],
  canRetry: RETRYABLE_FAILURES.has(kind),
});

// By name: the DOMException of a cancelled fetch may come from another realm than the global one.
const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError';

export function useImageUploads({
  api,
  purpose,
  max,
  subscribe,
  onRateLimited,
  decode,
  previews = BROWSER_PREVIEWS,
}: UseImageUploadsOptions): ImageUploads {
  const [tiles, dispatch] = useReducer(tilesReducer, []);
  const [refusals, setRefusals] = useState<readonly FileRefusalNotice[]>([]);
  const [announcement, setAnnouncement] = useState('');

  // Outside React state: read synchronously by rapid adds and by async callbacks that outlive a render.
  const live = useRef({
    keys: [] as string[],
    files: new Map<string, { file: File; contentType: MediaContentType | null }>(),
    controllers: new Map<string, AbortController>(),
    previews: new Map<string, string>(),
    nextKey: 0,
  });
  const latest = useRef({ api, purpose, subscribe, onRateLimited, previews });
  useEffect(() => {
    latest.current = { api, purpose, subscribe, onRateLimited, previews };
  });

  const announce = useCallback((key: string, text: (position: number, total: number) => string) => {
    const { keys } = live.current;
    const position = keys.indexOf(key) + 1;
    if (position > 0) setAnnouncement(text(position, keys.length));
  }, []);

  const start = useCallback(
    (key: string) => {
      const entry = live.current.files.get(key);
      if (entry === undefined || entry.contentType === null) return;
      const { file, contentType } = entry;
      live.current.controllers.get(key)?.abort();
      const controller = new AbortController();
      live.current.controllers.set(key, controller);
      dispatch({
        type: 'patch',
        key,
        patch: {
          status: 'uploading',
          progress: 0,
          mediaId: null,
          failure: null,
          message: null,
          canRetry: false,
        },
      });
      const { api: client, purpose: target, subscribe: wake } = latest.current;
      uploadImage({
        api: client,
        purpose: target,
        file,
        contentType,
        signal: controller.signal,
        onProgress: (progress) => {
          dispatch({ type: 'patch', key, patch: { progress } });
        },
        onProcessing: (mediaId) => {
          dispatch({ type: 'patch', key, patch: { status: 'processing', mediaId, progress: 100 } });
        },
        ...(wake === undefined ? {} : { subscribe: wake }),
      }).then(
        ({ mediaId, image }) => {
          dispatch({ type: 'patch', key, patch: { status: 'ready', mediaId, image } });
          announce(key, ANNOUNCE_COPY.ready);
        },
        (error: unknown) => {
          if (isAbort(error)) return;
          const kind = error instanceof UploadFailure ? error.kind : 'unexpected';
          dispatch({ type: 'patch', key, patch: failed(kind) });
          announce(key, (position, total) => ANNOUNCE_COPY.failed(position, total, FAILURE_COPY[kind]));
          if (error instanceof UploadFailure && kind === 'rate_limited' && error.retryAfterSeconds !== null) {
            latest.current.onRateLimited?.(error.retryAfterSeconds);
          }
        },
      );
    },
    [announce],
  );

  const drop = useCallback((key: string) => {
    const state = live.current;
    state.controllers.get(key)?.abort();
    state.controllers.delete(key);
    state.files.delete(key);
    const preview = state.previews.get(key);
    if (preview !== undefined) latest.current.previews.revoke(preview);
    state.previews.delete(key);
    state.keys = state.keys.filter((item) => item !== key);
  }, []);

  const add = useCallback(
    (files: Iterable<File>) => {
      const state = live.current;
      const refused: FileRefusalNotice[] = [];
      for (const file of files) {
        state.nextKey += 1;
        const key = `upload-${String(state.nextKey)}`;
        if (state.keys.length >= max) {
          refused.push({ key, fileName: file.name, reason: 'count', message: REFUSAL_COPY.count(max) });
          continue;
        }
        const previewUrl = latest.current.previews.create(file);
        state.keys.push(key);
        state.files.set(key, { file, contentType: null });
        state.previews.set(key, previewUrl);
        dispatch({
          type: 'add',
          tile: {
            key,
            fileName: file.name,
            previewUrl,
            status: 'checking',
            progress: 0,
            mediaId: null,
            image: null,
            failure: null,
            message: null,
            canRetry: false,
          },
        });
        void checkImageFile(file, decode).then((check) => {
          if (!state.files.has(key)) return; // removed while checking
          if (check.ok) {
            state.files.set(key, { file, contentType: check.contentType });
            start(key);
            return;
          }
          drop(key);
          dispatch({ type: 'remove', key });
          setRefusals((current) => [
            ...current,
            { key, fileName: file.name, reason: check.reason, message: REFUSAL_COPY[check.reason](max) },
          ]);
        });
      }
      // A new pick replaces the previous pick's refusals.
      setRefusals(refused);
    },
    [decode, drop, max, start],
  );

  const remove = useCallback(
    (key: string) => {
      drop(key);
      dispatch({ type: 'remove', key });
    },
    [drop],
  );

  const retry = useCallback(
    (key: string) => {
      const tile = tiles.find((item) => item.key === key);
      if (tile?.status === 'failed' && tile.canRetry) start(key);
    },
    [start, tiles],
  );

  const markNotAttachable = useCallback(
    (mediaIds: readonly string[]) => {
      for (const tile of tiles) {
        if (tile.mediaId !== null && mediaIds.includes(tile.mediaId)) {
          dispatch({ type: 'patch', key: tile.key, patch: failed('not_attachable') });
        }
      }
    },
    [tiles],
  );

  const clear = useCallback(() => {
    for (const key of [...live.current.keys]) drop(key);
    dispatch({ type: 'clear' });
    setRefusals([]);
  }, [drop]);

  // Leaving the screen cancels what is in flight and frees the previews.
  useEffect(() => {
    const state = live.current;
    return () => {
      for (const key of [...state.keys]) drop(key);
    };
  }, [drop]);

  return useMemo(() => {
    const readyMediaIds = tiles.flatMap((tile) =>
      tile.status === 'ready' && tile.mediaId !== null ? [tile.mediaId] : [],
    );
    return {
      tiles,
      refusals,
      announcement,
      readyMediaIds,
      busy: tiles.some(
        (tile) => tile.status === 'checking' || tile.status === 'uploading' || tile.status === 'processing',
      ),
      canAddMore: tiles.length < max,
      add,
      remove,
      retry,
      markNotAttachable,
      clear,
    };
  }, [add, announcement, clear, markNotAttachable, max, refusals, remove, retry, tiles]);
}
