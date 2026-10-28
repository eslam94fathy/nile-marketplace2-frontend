import type { ReactEventHandler } from 'react';
import { cn } from '../cn';
import { CategoryImagePlaceholder, ProductImagePlaceholder } from './image-placeholders';

// API images (conventions §12.1, design 01 §15.6, FR2-Q3): a plain `<img srcset>` of the three ready-made widths,
// no Next.js optimiser. No hooks and no directive, so Server Components render it without client JavaScript.

/** Nominal widths of `ImageDto.urls` [SPEC 14]. Never upscaled, so a small original makes narrower files. */
export const IMAGE_WIDTHS = { thumb: 200, medium: 600, large: 1200 } as const;

/** The fields of `ImageDto` (and `ProductImageDto`, `CategoryImageDto`) that rendering needs. */
export interface NileImageSource {
  readonly urls: { readonly thumb: string; readonly medium: string; readonly large: string };
  /** Of the processed `large` file [SPEC 14]. */
  readonly width: number;
  readonly height: number;
}

export type ImagePlaceholderKind = 'product' | 'category';

export interface NileImageProps {
  readonly image: NileImageSource | null;
  /** The image's `altText`, else the item's name; `""` for a decorative repeat. Also names the placeholder. */
  readonly alt: string;
  /** Rendered width per layout, e.g. `(min-width: 768px) 25vw, 50vw`. */
  readonly sizes: string;
  /** Shown when `image` is `null`, sized by `className` like the image. */
  readonly placeholder: ImagePlaceholderKind;
  /** The page's largest image: loads eagerly with high priority. Every other image loads lazily. */
  readonly priority?: boolean;
  readonly className?: string;
  /** Client components only (private images, `PrivateImage`). */
  readonly onError?: ReactEventHandler<HTMLImageElement>;
}

/**
 * `srcset` with each file's real width: the backend keeps the aspect ratio and never upscales, so `width` (of
 * `large`) caps the other two. Equal widths (a small original) are listed once.
 */
export function imageSrcSet(image: NileImageSource): string {
  const candidates = [
    [image.urls.thumb, Math.min(IMAGE_WIDTHS.thumb, image.width)],
    [image.urls.medium, Math.min(IMAGE_WIDTHS.medium, image.width)],
    [image.urls.large, image.width],
  ] as const;
  const seen = new Set<number>();
  return candidates
    .filter(([, width]) => !seen.has(width) && seen.add(width))
    .map(([url, width]) => `${url} ${String(width)}w`)
    .join(', ');
}

export function NileImage({
  image,
  alt,
  sizes,
  placeholder,
  priority = false,
  className,
  onError,
}: NileImageProps) {
  if (image === null) {
    const Placeholder = placeholder === 'product' ? ProductImagePlaceholder : CategoryImagePlaceholder;
    return (
      <Placeholder
        {...(className === undefined ? {} : { className })}
        {...(alt === '' ? {} : { label: alt })}
      />
    );
  }
  return (
    // The API serves ready-made widths; the Next.js optimiser is not used (FR2-Q3, design 01 §15.6).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.urls.medium}
      srcSet={imageSrcSet(image)}
      sizes={sizes}
      alt={alt}
      width={image.width}
      height={image.height}
      decoding="async"
      {...(priority ? { loading: 'eager', fetchPriority: 'high' } : { loading: 'lazy' })}
      className={cn('object-cover', className)}
      {...(onError === undefined ? {} : { onError })}
    />
  );
}
