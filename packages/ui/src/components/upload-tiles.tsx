'use client';

import { rateLimitedMessage } from '@nile/domain';
import { ImagePlus, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { type ChangeEvent, type DragEvent, useId, useState } from 'react';
import { cn } from '../cn';
import { UI_COPY } from '../copy';
import { buttonVariants } from './button';

// Photo picker and upload tiles (conventions §12.2). Presentational: the state machine is `useImageUploads` in
// @nile/media, whose tiles and refusals fit these props. The native file input stays in the tab order (visually
// hidden, its label styled as a button), so the picker is keyboard operable; drag and drop is a desktop extra.

export type UploadTileViewStatus = 'checking' | 'uploading' | 'processing' | 'ready' | 'failed';

export interface UploadTileView {
  readonly key: string;
  readonly fileName: string;
  readonly previewUrl: string;
  readonly status: UploadTileViewStatus;
  readonly progress: number;
  readonly message: string | null;
  readonly canRetry: boolean;
}

export interface UploadRefusalView {
  readonly key: string;
  readonly fileName: string;
  readonly message: string;
}

export interface UploadTilesProps {
  readonly tiles: readonly UploadTileView[];
  readonly refusals: readonly UploadRefusalView[];
  /** Polite live-region text, e.g. "Photo 2 of 3 ready." */
  readonly announcement: string;
  /** `accept` of the input, e.g. `image/jpeg,image/png,image/webp`. */
  readonly accept: string;
  readonly canAddMore: boolean;
  readonly onAdd: (files: File[]) => void;
  readonly onRemove: (key: string) => void;
  readonly onRetry: (key: string) => void;
  /** Seconds left of a `RATE_LIMITED` wait (conventions §4); the picker is disabled meanwhile. */
  readonly cooldownSeconds?: number;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly hint?: string;
  readonly className?: string;
}

function statusText(tile: UploadTileView): string {
  switch (tile.status) {
    case 'checking':
      return UI_COPY.uploadChecking;
    case 'uploading':
      return UI_COPY.uploadProgress(tile.progress);
    case 'processing':
      return UI_COPY.uploadProcessing;
    case 'ready':
      return UI_COPY.uploadReady;
    case 'failed':
      return tile.message ?? UI_COPY.genericError;
  }
}

export function UploadTiles({
  tiles,
  refusals,
  announcement,
  accept,
  canAddMore,
  onAdd,
  onRemove,
  onRetry,
  cooldownSeconds = 0,
  disabled = false,
  label = UI_COPY.addPhotos,
  hint = UI_COPY.photoLimits,
  className,
}: UploadTilesProps) {
  const inputId = useId();
  const hintId = useId();
  const [dragging, setDragging] = useState(false);
  const pickerDisabled = disabled || !canAddMore || cooldownSeconds > 0;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Picking the same file again must fire `change` again.
    event.target.value = '';
    if (files.length > 0) onAdd(files);
  };
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (pickerDisabled) return;
    event.preventDefault();
    setDragging(true);
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (pickerDisabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onAdd(files);
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-start gap-2 rounded-lg border border-dashed border-input p-4',
          dragging && 'border-primary bg-muted',
        )}
      >
        <input
          id={inputId}
          type="file"
          accept={accept}
          multiple
          disabled={pickerDisabled}
          aria-describedby={hintId}
          onChange={handleChange}
          className="peer sr-only"
        />
        <label
          htmlFor={inputId}
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
            pickerDisabled && 'pointer-events-none opacity-60',
          )}
        >
          <ImagePlus aria-hidden="true" />
          {label}
        </label>
        <p id={hintId} className="text-sm text-muted-foreground">
          {cooldownSeconds > 0 ? rateLimitedMessage(cooldownSeconds) : hint}
        </p>
      </div>

      {refusals.length === 0 ? null : (
        <ul className="flex flex-col gap-1 text-sm text-destructive">
          {refusals.map((refusal) => (
            <li key={refusal.key}>
              {refusal.fileName}: {refusal.message}
            </li>
          ))}
        </ul>
      )}

      {tiles.length === 0 ? null : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((tile) => (
            <li key={tile.key} className="flex flex-col gap-2 rounded-lg border border-border p-2">
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                {/* A local `blob:` preview: nothing for an optimiser to do. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tile.previewUrl} alt={tile.fileName} className="size-full object-cover" />
                {tile.status === 'uploading' || tile.status === 'processing' || tile.status === 'checking' ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="absolute top-2 right-2 size-5 animate-spin text-primary"
                  />
                ) : null}
              </div>
              {tile.status === 'uploading' ? (
                <progress
                  max={100}
                  value={tile.progress}
                  aria-label={UI_COPY.uploadProgressOf(tile.fileName)}
                  className="h-1.5 w-full accent-primary"
                />
              ) : null}
              <p
                className={cn(
                  'text-sm',
                  tile.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {statusText(tile)}
              </p>
              <div className="flex flex-wrap gap-1">
                {tile.status === 'failed' && tile.canRetry ? (
                  <button
                    type="button"
                    onClick={() => {
                      onRetry(tile.key);
                    }}
                    aria-label={UI_COPY.retryUpload(tile.fileName)}
                    className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                  >
                    <RotateCcw aria-hidden="true" />
                    {UI_COPY.tryAgain}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    onRemove(tile.key);
                  }}
                  aria-label={UI_COPY.removeUpload(tile.fileName)}
                  className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                >
                  <X aria-hidden="true" />
                  {UI_COPY.remove}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
