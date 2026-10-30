'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { UI_COPY } from '../copy';
import { Button } from './button';
import { Dialog, DialogContent } from './dialog';
import { NileImage, type NileImageSource } from './nile-image';

// Photo lightbox (conventions §12.1): a dialog (focus moves in and back, Escape closes) showing one photo at a time,
// with previous / next buttons and the arrow keys. Used by the product gallery (T-K1) and review photos (T-K2).

export interface LightboxImage extends NileImageSource {
  readonly id: string;
  /** Alt text already resolved by the caller (`imageAlt`). */
  readonly alt: string;
}

export interface LightboxProps {
  readonly images: readonly LightboxImage[];
  /** The photo shown; `null` closes the lightbox. */
  readonly index: number | null;
  readonly onIndexChange: (index: number | null) => void;
  /** Dialog title, e.g. the product name. */
  readonly title: string;
}

export function Lightbox({ images, index, onIndexChange, title }: LightboxProps) {
  const total = images.length;
  const current = index === null ? undefined : images[index];
  const show = (next: number) => {
    onIndexChange((next + total) % total);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (index === null || total < 2) return;
    if (event.key === 'ArrowLeft') show(index - 1);
    else if (event.key === 'ArrowRight') show(index + 1);
    else return;
    event.preventDefault();
  };

  return (
    <Dialog
      open={current !== undefined}
      onOpenChange={(open) => {
        if (!open) onIndexChange(null);
      }}
    >
      {current === undefined || index === null ? null : (
        <DialogContent title={title} className="max-w-4xl" onKeyDown={onKeyDown}>
          <div className="flex min-h-0 flex-1 items-center justify-center bg-muted">
            <NileImage
              image={current}
              alt={current.alt}
              sizes="(min-width: 896px) 896px, 100vw"
              placeholder="product"
              priority
              className="max-h-[70dvh] w-auto object-contain"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label={UI_COPY.previousPhoto}
              disabled={total < 2}
              onClick={() => {
                show(index - 1);
              }}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <p role="status" className="text-sm text-muted-foreground">
              {UI_COPY.photoOf(index + 1, total)}
            </p>
            <Button
              variant="outline"
              size="icon"
              aria-label={UI_COPY.nextPhoto}
              disabled={total < 2}
              onClick={() => {
                show(index + 1);
              }}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
