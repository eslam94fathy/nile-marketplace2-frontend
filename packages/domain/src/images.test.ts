import { describe, expect, it } from 'vitest';
import { imageAlt, primaryImage, variantImage } from './images';

const image = (id: string, position: number) => ({ id, position, altText: null });

describe('primaryImage', () => {
  it('is the lowest position, whatever the order', () => {
    expect(primaryImage([image('b', 1), image('a', 0), image('c', 2)])?.id).toBe('a');
  });

  it('is null without images', () => {
    expect(primaryImage([])).toBeNull();
  });
});

describe('variantImage (backend spec 06 §8.1)', () => {
  const product = {
    images: [image('main', 0), image('red', 1)],
    variants: [
      { id: 'v-red', imageId: 'red' },
      { id: 'v-blue', imageId: null },
      { id: 'v-stale', imageId: 'removed' },
    ],
  };

  it("shows the variant's own image", () => {
    expect(variantImage(product, 'v-red')?.id).toBe('red');
  });

  it('falls back to the primary image for a variant without one, no selection or an unknown variant', () => {
    expect(variantImage(product, 'v-blue')?.id).toBe('main');
    expect(variantImage(product, null)?.id).toBe('main');
    expect(variantImage(product, 'v-unknown')?.id).toBe('main');
  });

  it('falls back to the primary image when the variant names an image the list no longer has', () => {
    expect(variantImage(product, 'v-stale')?.id).toBe('main');
  });

  it('is null for a product without images', () => {
    expect(variantImage({ images: [], variants: [{ id: 'v', imageId: null }] }, 'v')).toBeNull();
  });
});

describe('imageAlt (conventions §12.1)', () => {
  it("uses the image's alt text, else the item's name", () => {
    expect(imageAlt({ altText: 'Red linen shirt, front' }, 'Linen shirt')).toBe('Red linen shirt, front');
    expect(imageAlt({ altText: null }, 'Linen shirt')).toBe('Linen shirt');
    expect(imageAlt(null, 'Linen shirt')).toBe('Linen shirt');
  });
});
