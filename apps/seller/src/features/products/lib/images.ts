import type { Schema } from '@nile/api';
import type { ProductImage, SellerProduct, SellerVariant } from '../api';

// Image manager decisions (spec 02 SE-10-I): order moves, the variant tie and the edit body.

/** A product has at most 8 images [SPEC 06 R-3]. */
export const PRODUCT_IMAGE_MAX = 8;

/** Alt text 1..200 characters, optional (`UpdateProductImageDto`). */
export const IMAGE_ALT_MAX = 200;

export type ImageMove = 'earlier' | 'later' | 'main';

/** Images in display order (the API's `position`, lowest first). */
export function orderedImages(images: readonly ProductImage[]): ProductImage[] {
  return [...images].sort((a, b) => a.position - b.position);
}

/** The full new order after one move (SE-Q-9), or `null` when the move changes nothing. */
export function movedOrder(
  images: readonly ProductImage[],
  imageId: string,
  move: ImageMove,
): string[] | null {
  const ids = orderedImages(images).map((image) => image.id);
  const from = ids.indexOf(imageId);
  if (from === -1) return null;
  const to = move === 'main' ? 0 : move === 'earlier' ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length || to === from) return null;
  ids.splice(from, 1);
  ids.splice(to, 0, imageId);
  return ids;
}

/** The image a variant shows: its own lowest-position image, else `null` (the main image). */
export function imageOfVariant(product: SellerProduct, variantId: string): ProductImage | null {
  return orderedImages(product.images).find((image) => image.variantId === variantId) ?? null;
}

/** The variant an image is tied to, when it still exists. */
export function variantOfImage(product: SellerProduct, image: ProductImage): SellerVariant | null {
  return product.variants.find((variant) => variant.id === image.variantId) ?? null;
}

export interface ImageEditValues {
  /** Trimmed; `null` when empty. */
  readonly altText: string | null;
  /** `null` = all variants. */
  readonly variantId: string | null;
}

/** Only changed fields (cleared → `null`); `null` when nothing changed (the API refuses an empty body). */
export function imagePatch(
  values: ImageEditValues,
  image: ProductImage,
): Schema<'UpdateProductImageDto'> | null {
  const patch: Schema<'UpdateProductImageDto'> = {
    ...(values.altText === image.altText ? {} : { altText: values.altText }),
    ...(values.variantId === image.variantId ? {} : { variantId: values.variantId }),
  };
  return Object.keys(patch).length === 0 ? null : patch;
}
