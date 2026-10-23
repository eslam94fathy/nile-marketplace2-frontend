import { describe, expect, it } from 'vitest';
import {
  initialSelection,
  maxQuantity,
  optionState,
  parseQuantity,
  selectedVariant,
  type ProductDetail,
  type ProductVariant,
} from './variant-selection';

let sequence = 0;
function variant(options: Record<string, string>, overrides: Partial<ProductVariant> = {}): ProductVariant {
  sequence += 1;
  return {
    id: `01900000-0000-7000-8000-${String(sequence).padStart(12, '0')}`,
    sku: `SKU-${sequence}`,
    price: '100.00',
    compareAtPrice: null,
    options: Object.entries(options).map(([attributeCode, optionCode]) => ({
      attributeCode,
      optionCode,
      value: optionCode.toUpperCase(),
    })),
    inStock: true,
    availableQuantity: 10,
    ...overrides,
  };
}

function product(attributes: Record<string, string[]>, variants: ProductVariant[]): ProductDetail {
  return {
    id: '01900000-0000-7000-8000-0000000000ff',
    slug: 'tee',
    name: 'Tee',
    description: 'A tee.',
    category: { id: 'c', name: 'Tees', slug: 'tees', path: [] },
    seller: { id: 's', businessName: 'Shop' },
    minPrice: '100.00',
    maxPrice: '120.00',
    inStock: variants.some((v) => v.inStock),
    attributes: Object.entries(attributes).map(([code, options]) => ({
      code,
      name: code,
      options: options.map((option) => ({ code: option, value: option.toUpperCase() })),
    })),
    variants,
    publishedAt: '2026-10-14T08:00:00.000Z',
  };
}

const M_RED = variant({ size: 'm', color: 'red' });
const M_BLUE = variant({ size: 'm', color: 'blue' }, { inStock: false, availableQuantity: 0 });
const L_RED = variant({ size: 'l', color: 'red' }, { availableQuantity: 250 });
const TEE = product({ size: ['m', 'l'], color: ['red', 'blue'] }, [M_RED, M_BLUE, L_RED]);

describe('selectedVariant', () => {
  it('matches exactly one variant once every attribute is chosen', () => {
    expect(selectedVariant(TEE, { size: 'm', color: 'red' })).toBe(M_RED);
    expect(selectedVariant(TEE, { size: 'l', color: 'red' })).toBe(L_RED);
  });

  it('is null while incomplete or for a combination that does not exist', () => {
    expect(selectedVariant(TEE, { size: 'm' })).toBeNull();
    expect(selectedVariant(TEE, {})).toBeNull();
    expect(selectedVariant(TEE, { size: 'l', color: 'blue' })).toBeNull();
  });

  it('a product without attributes always has its default variant selected', () => {
    const only = variant({});
    expect(selectedVariant(product({}, [only]), {})).toBe(only);
  });
});

describe('initialSelection', () => {
  it('takes the variant from the URL when it belongs to the product', () => {
    expect(initialSelection(TEE, L_RED.id)).toEqual({ size: 'l', color: 'red' });
  });

  it('ignores an unknown variant id and preselects single-option attributes only', () => {
    const shirt = product({ size: ['m'], color: ['red', 'blue'] }, [variant({ size: 'm', color: 'red' })]);
    expect(initialSelection(shirt, 'not-a-variant')).toEqual({ size: 'm' });
    expect(initialSelection(TEE, null)).toEqual({});
  });
});

describe('optionState', () => {
  it('disables an option that matches no variant with the other selections', () => {
    expect(optionState(TEE, { size: 'l' }, 'color', 'blue')).toBe('unavailable');
    expect(optionState(TEE, { size: 'l' }, 'color', 'red')).toBe('available');
  });

  it('marks an option whose only matching variants are out of stock', () => {
    expect(optionState(TEE, { size: 'm' }, 'color', 'blue')).toBe('outOfStock');
  });

  it('judges an attribute by the others only, so the current choice can always be changed', () => {
    expect(optionState(TEE, { size: 'm', color: 'blue' }, 'size', 'l')).toBe('unavailable');
    expect(optionState(TEE, { size: 'm', color: 'red' }, 'size', 'l')).toBe('available');
  });
});

describe('quantity', () => {
  it('caps the stepper at what is available and at 99', () => {
    expect(maxQuantity(M_RED)).toBe(10);
    expect(maxQuantity(L_RED)).toBe(99);
  });

  it.each([
    [null, 1],
    ['3', 3],
    ['0', 1],
    ['500', 10],
    ['2.5', 1],
    ['-2', 1],
    ['abc', 1],
  ])('?qty=%j → %i (max 10)', (value, expected) => {
    expect(parseQuantity(value, 10)).toBe(expected);
  });
});
