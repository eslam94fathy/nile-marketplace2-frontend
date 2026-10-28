// Which product image to show (backend spec 06 §8.1): the primary image is the one at the lowest position
// (`position = 0`); a variant shows its `imageId` (the backend already picks the variant's lowest-position image),
// else the primary image. Structural types, so this works for `ProductDetailDto` and the seller's DTOs alike.

export interface PositionedImage {
  readonly id: string;
  readonly position: number;
}

export interface ProductImages<I extends PositionedImage> {
  readonly images: readonly I[];
  readonly variants: readonly { readonly id: string; readonly imageId: string | null }[];
}

export function primaryImage<I extends PositionedImage>(images: readonly I[]): I | null {
  let primary: I | null = null;
  for (const image of images) {
    if (primary === null || image.position < primary.position) primary = image;
  }
  return primary;
}

/** The image for the selected variant (`null` → none selected); `null` when the product has no images. */
export function variantImage<I extends PositionedImage>(
  product: ProductImages<I>,
  variantId: string | null,
): I | null {
  const imageId = product.variants.find((variant) => variant.id === variantId)?.imageId ?? null;
  const own = imageId === null ? undefined : product.images.find((image) => image.id === imageId);
  return own ?? primaryImage(product.images);
}

/** Alt text (conventions §12.1): the image's own `altText`, else the item's name. */
export function imageAlt(image: { readonly altText: string | null } | null, name: string): string {
  return image?.altText ?? name;
}
