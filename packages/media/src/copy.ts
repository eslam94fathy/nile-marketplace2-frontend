import type { FileRefusal } from './check-file';
import type { UploadFailureKind } from './upload-image';

// Upload copy (conventions §12.2; CLAUDE.md §7: no inline literals). Tile labels and the picker live in @nile/ui.

/** Why a file was refused before upload, shown under the picker. */
export const REFUSAL_COPY: Readonly<Record<FileRefusal | 'count', (max: number) => string>> = {
  type: () => 'Use a JPEG, PNG or WebP image.',
  size: () => 'This photo is larger than 5 MB.',
  dimensions: () => 'This photo is too small. Use one at least 200 × 200 pixels.',
  unreadable: () => "This file isn't a valid image.",
  // Not in conventions §12.2; approved 2026-10-28 (CLAUDE.md §14.1at).
  count: (max) => `You can add up to ${String(max)} photos.`,
};

/** Why an upload failed, shown on its tile. */
export const FAILURE_COPY: Readonly<Record<UploadFailureKind, string>> = {
  open_limit: 'You have too many photos uploading. Wait a moment and try again.',
  invalid: "This file isn't a valid image.",
  decode: "We couldn't read this image. Try another one.",
  dimensions: "This image's size isn't supported. Try another one.",
  interrupted: "The upload didn't finish. Try again.",
  rate_limited: "The upload didn't finish. Try again.",
  not_attachable: 'Upload this photo again.',
  unexpected: 'Something went wrong. Please try again.',
};

/** Polite live-region announcements, e.g. "Photo 2 of 3 ready." */
export const ANNOUNCE_COPY = {
  ready: (position: number, total: number) => `Photo ${String(position)} of ${String(total)} ready.`,
  failed: (position: number, total: number, reason: string) =>
    `Photo ${String(position)} of ${String(total)} failed. ${reason}`,
} as const;
