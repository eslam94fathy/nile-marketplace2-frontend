// Upload limits (backend spec 14 §1, conventions §12.2). Checked in the browser before any request so a refused
// file costs nothing; the backend checks them again.

export const MEDIA_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type MediaContentType = (typeof MEDIA_CONTENT_TYPES)[number];

/** `accept` of the file input. */
export const MEDIA_ACCEPT = MEDIA_CONTENT_TYPES.join(',');

/** The backend's `MEDIA_MAX_UPLOAD_BYTES` (5 MB, R-1). */
export const MEDIA_MAX_UPLOAD_BYTES = 5_242_880;

/** Smallest width and height the backend processes. */
export const MEDIA_MIN_DIMENSION_PX = 200;

/** `complete` before storage has the object (`MEDIA_UPLOAD_MISSING`): retried 3 times, 1 s apart (design 01 §15.4). */
export const COMPLETE_MISSING_RETRIES = 3;
export const COMPLETE_RETRY_DELAY_MS = 1_000;

/** Polling `GET /media/{id}` while processing: 1 s, 2 s, 4 s … at most 30 s apart (design 01 §15.1). */
export const MEDIA_POLL_FIRST_DELAY_MS = 1_000;
export const MEDIA_POLL_MAX_DELAY_MS = 30_000;
