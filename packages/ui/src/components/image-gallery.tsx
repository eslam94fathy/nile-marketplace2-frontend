'use client';

import { useState } from 'react';
import { cn } from '../cn';
import { UI_COPY } from '../copy';
import { Lightbox, type LightboxImage } from './lightbox';
import { NileImage } from './nile-image';

// Product gallery (spec 01 SF-05 item 1): the main photo (the page's largest image: eager, high priority) and the
// thumbnails in API order. The caller owns which photo is shown, so choosing a variant can switch it; the main
// photo opens the lightbox. No photos → the brand placeholder.

export interface ImageGalleryProps {
  readonly images: readonly LightboxImage[];
  /** Id of the photo shown; falls back to the first when it isn't in `images`. */
  readonly activeId: string | null;
  readonly onActiveChange: (id: string) => void;
  /** The item's name: the lightbox title and the placeholder's accessible name. */
  readonly name: string;
  readonly className?: string;
}

const FRAME = 'aspect-square w-full rounded-lg bg-muted';

export function ImageGallery({ images, activeId, onActiveChange, name, className }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const found = images.findIndex((image) => image.id === activeId);
  const activeIndex = found === -1 ? 0 : found;
  const active = images[activeIndex];

  if (active === undefined) {
    return (
      <div className={className}>
        <NileImage image={null} alt={name} sizes="" placeholder="product" className={FRAME} />
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <button
        type="button"
        className="block w-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-haspopup="dialog"
        onClick={() => {
          setLightboxIndex(activeIndex);
        }}
      >
        <NileImage
          image={active}
          alt={active.alt}
          sizes="(min-width: 1024px) 50vw, 100vw"
          placeholder="product"
          priority
          className={cn(FRAME, 'object-contain')}
        />
        <span className="sr-only">{UI_COPY.enlargePhoto}</span>
      </button>
      {images.length < 2 ? null : (
        <ul aria-label={UI_COPY.photos} className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <li key={image.id}>
              <button
                type="button"
                aria-label={UI_COPY.showPhoto(index + 1, images.length)}
                aria-pressed={index === activeIndex}
                className={cn(
                  'block size-16 overflow-hidden rounded-md border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  index === activeIndex ? 'border-primary' : 'border-transparent',
                )}
                onClick={() => {
                  onActiveChange(image.id);
                }}
              >
                {/* The button names the photo; the thumbnail repeats the main image (conventions §12.1). */}
                <NileImage image={image} alt="" sizes="64px" placeholder="product" className="size-full" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Lightbox images={images} index={lightboxIndex} onIndexChange={setLightboxIndex} title={name} />
    </div>
  );
}
