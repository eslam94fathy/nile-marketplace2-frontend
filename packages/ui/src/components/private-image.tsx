'use client';

import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../cn';
import { UI_COPY } from '../copy';
import { NileImage, type NileImageSource } from './nile-image';

// Private images (support attachments, return photos) carry presigned URLs that expire after 10 min [SPEC 14 ME-1].
// A failed load asks the owner to read the resource again, once per image (conventions §12.1). A URL that failed
// is never shown again: the box below stands in until the refetch brings a new URL; if that one fails too, or the
// refetch brings the same URL, the box stays.

export interface PrivateImageProps {
  readonly image: NileImageSource & { readonly id: string };
  readonly alt: string;
  readonly sizes: string;
  /** Refetch the owning resource (e.g. the ticket thread). Called at most once per image. */
  readonly onExpired: () => void;
  readonly className?: string;
}

interface LoadState {
  readonly imageId: string;
  readonly failedUrl: string | null;
  readonly refetched: boolean;
}

const fresh = (imageId: string): LoadState => ({ imageId, failedUrl: null, refetched: false });

export function PrivateImage({ image, alt, sizes, onExpired, className }: PrivateImageProps) {
  const [state, setState] = useState<LoadState>(() => fresh(image.id));
  // Another image in the same place starts over (state adjusted during render, not in an effect).
  const current = state.imageId === image.id ? state : fresh(image.id);
  if (current !== state) setState(current);

  const url = image.urls.medium;
  if (current.failedUrl === url) {
    return (
      <div
        role="img"
        aria-label={alt === '' ? UI_COPY.imageUnavailable : `${alt}: ${UI_COPY.imageUnavailable}`}
        className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}
      >
        <ImageOff aria-hidden="true" className="size-6" />
      </div>
    );
  }

  const handleError = () => {
    setState({ ...current, failedUrl: url, refetched: true });
    if (!current.refetched) onExpired();
  };

  return (
    <NileImage
      image={image}
      alt={alt}
      sizes={sizes}
      placeholder="product"
      {...(className === undefined ? {} : { className })}
      onError={handleError}
    />
  );
}
