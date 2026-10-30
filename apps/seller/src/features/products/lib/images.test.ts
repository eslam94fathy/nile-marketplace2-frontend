import { productImageFactory, sellerProductFactory, sellerVariantFactory } from '@nile/test-utils';
import { describe, expect, it } from 'vitest';
import { imageOfVariant, imagePatch, movedOrder, orderedImages } from './images';

const A = productImageFactory({ position: 0 });
const B = productImageFactory({ position: 1 });
const C = productImageFactory({ position: 2 });
// Out of order on purpose: the API's `position` decides.
const IMAGES = [C, A, B];

describe('image order (spec 02 SE-10-I, SE-Q-9)', () => {
  it('orders by position', () => {
    expect(orderedImages(IMAGES).map((image) => image.id)).toEqual([A.id, B.id, C.id]);
  });

  it('moves one step or to the front, always as the full order', () => {
    expect(movedOrder(IMAGES, B.id, 'earlier')).toEqual([B.id, A.id, C.id]);
    expect(movedOrder(IMAGES, B.id, 'later')).toEqual([A.id, C.id, B.id]);
    expect(movedOrder(IMAGES, C.id, 'main')).toEqual([C.id, A.id, B.id]);
  });

  it('a move that changes nothing sends nothing', () => {
    expect(movedOrder(IMAGES, A.id, 'earlier')).toBeNull();
    expect(movedOrder(IMAGES, A.id, 'main')).toBeNull();
    expect(movedOrder(IMAGES, C.id, 'later')).toBeNull();
    expect(movedOrder(IMAGES, 'missing', 'main')).toBeNull();
  });
});

describe('variant image', () => {
  it("is the variant's lowest-position image, else none (the main image)", () => {
    const variant = sellerVariantFactory();
    const other = sellerVariantFactory();
    const product = {
      ...sellerProductFactory(),
      variants: [variant, other],
      images: [{ ...C, variantId: variant.id }, { ...B, variantId: variant.id }, A],
    };
    expect(imageOfVariant(product, variant.id)?.id).toBe(B.id);
    expect(imageOfVariant(product, other.id)).toBeNull();
  });
});

describe('image edit body', () => {
  const image = { ...A, altText: 'Front', variantId: null };

  it('only changed fields; cleared → null', () => {
    expect(imagePatch({ altText: 'Front', variantId: null }, image)).toBeNull();
    expect(imagePatch({ altText: null, variantId: null }, image)).toEqual({ altText: null });
    expect(imagePatch({ altText: 'Front', variantId: 'v1' }, image)).toEqual({ variantId: 'v1' });
  });
});
