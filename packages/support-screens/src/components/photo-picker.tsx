'use client';

import { isApiError } from '@nile/api';
import { MEDIA_ACCEPT, useImageUploads, type ImageUploads, type UploadTile } from '@nile/media';
import { UploadTiles, useCooldown, type UploadTileView } from '@nile/ui';
import { ATTACHMENTS_MAX } from '../api';
import { useSupportConfig } from '../config';

function tileView(tile: UploadTile): UploadTileView {
  return {
    key: tile.key,
    fileName: tile.fileName,
    previewUrl: tile.previewUrl,
    status: tile.status,
    progress: tile.progress,
    message: tile.message,
    canRetry: tile.canRetry,
  };
}

/** Support attachments: up to 3 private photos per message (spec 00 §12.2, backend spec 16 §1). */
export function useSupportUploads() {
  const { api } = useSupportConfig();
  const cooldown = useCooldown();
  const uploads = useImageUploads({
    api,
    purpose: 'support_attachment',
    max: ATTACHMENTS_MAX,
    onRateLimited: cooldown.start,
  });
  return { uploads, cooldownSeconds: cooldown.remaining };
}

/** `MEDIA_NOT_ATTACHABLE`: the tiles the API named show "Upload this photo again." (spec 00 §12.2). */
export function markNotAttachable(uploads: ImageUploads, error: unknown): boolean {
  if (!isApiError(error, 'MEDIA_NOT_ATTACHABLE')) return false;
  uploads.markNotAttachable(
    error.details.flatMap((detail) => (detail.value === undefined ? [] : [detail.value])),
  );
  return true;
}

export function PhotoPicker({
  label,
  uploads,
  cooldownSeconds,
}: {
  readonly label: string;
  readonly uploads: ImageUploads;
  readonly cooldownSeconds: number;
}) {
  return (
    <UploadTiles
      label={label}
      tiles={uploads.tiles.map(tileView)}
      refusals={uploads.refusals}
      announcement={uploads.announcement}
      accept={MEDIA_ACCEPT}
      canAddMore={uploads.canAddMore}
      cooldownSeconds={cooldownSeconds}
      onAdd={uploads.add}
      onRemove={uploads.remove}
      onRetry={uploads.retry}
    />
  );
}
