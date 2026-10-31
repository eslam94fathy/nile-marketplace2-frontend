import { defineFactory, fixtureId } from '../factory';

/** `ImageDto` with the three API widths at a made-up CDN. */
export const imageFactory = defineFactory<'ImageDto'>((sequence) => {
  const id = fixtureId(sequence);
  return {
    id,
    urls: {
      thumb: `https://media.test/public/${id}/thumb.webp`,
      medium: `https://media.test/public/${id}/medium.webp`,
      large: `https://media.test/public/${id}/large.webp`,
    },
    width: 1200,
    height: 900,
  };
});

/** `MediaDto`: `pending` by default; pass `{ status: 'ready', image: imageFactory() }` for a processed one. */
export const mediaFactory = defineFactory<'MediaDto'>((sequence) => ({
  id: fixtureId(1000 + sequence),
  purpose: 'review_image',
  status: 'pending',
  failureReason: null,
  image: null,
  createdAt: '2026-10-28T10:00:00.000Z',
}));

/** `ProductImageDto` (ids from 8500): a product image for all variants without alt text; pass `position` for order. */
export const productImageFactory = defineFactory<'ProductImageDto'>((sequence) => {
  const id = fixtureId(8500 + sequence);
  return {
    id,
    position: 0,
    variantId: null,
    altText: null,
    urls: {
      thumb: `https://media.test/public/${id}/thumb.webp`,
      medium: `https://media.test/public/${id}/medium.webp`,
      large: `https://media.test/public/${id}/large.webp`,
    },
    width: 1200,
    height: 900,
  };
});
