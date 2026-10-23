import type { Schema } from '@nile/api';
import { fixtureId, sellerProductFactory, sellerVariantFactory } from '@nile/test-utils';
import { describe, expect, it } from 'vitest';
import {
  createVariantSchema,
  editVariantSchema,
  emptyVariantValues,
  optionSignature,
  productPatch,
  productSchema,
  toCreateVariantBody,
  variantPatch,
} from '../schemas';
import { categoryChoices, categoryPath } from './categories';
import { hasFilters, parseProductFilters, productFiltersQuery } from './list-params';
import {
  attributesWithProblems,
  canAddVariant,
  isLastActiveVariant,
  takenCombinations,
  takenOptionIds,
  variantOptionsLabel,
} from './variants';

const UUID = fixtureId(3000);

const SIZE: Schema<'EffectiveAttributeDto'> = {
  id: fixtureId(5001),
  code: 'size',
  name: 'Size',
  sortOrder: 0,
  definedOnCategoryId: UUID,
  options: [
    { id: fixtureId(6001), code: 's', value: 'S', sortOrder: 0 },
    { id: fixtureId(6002), code: 'm', value: 'M', sortOrder: 1 },
  ],
};
const COLOR: Schema<'EffectiveAttributeDto'> = {
  id: fixtureId(5002),
  code: 'color',
  name: 'Color',
  sortOrder: 1,
  definedOnCategoryId: UUID,
  options: [
    { id: fixtureId(6101), code: 'red', value: 'Red', sortOrder: 0 },
    { id: fixtureId(6102), code: 'blue', value: 'Blue', sortOrder: 1 },
  ],
};
const ATTRIBUTES = [SIZE, COLOR];

const option = (attribute: Schema<'EffectiveAttributeDto'>, index: number) => {
  const chosen = attribute.options[index];
  if (chosen === undefined) throw new Error('no such option');
  return {
    attributeId: attribute.id,
    attributeCode: attribute.code,
    optionId: chosen.id,
    optionCode: chosen.code,
    value: chosen.value,
  };
};

/** A variant "S / Red". */
const S_RED = sellerVariantFactory({ isDefault: false, options: [option(SIZE, 0), option(COLOR, 0)] });

describe('product list filters, URL ⇄ API (spec 02 SE-08)', () => {
  it('reads valid values', () => {
    expect(parseProductFilters({ status: 'draft', category: UUID, name: '  mug ' })).toEqual({
      status: 'draft',
      categoryId: UUID,
      name: 'mug',
    });
  });

  it('drops invalid values instead of sending them (R-28)', () => {
    expect(parseProductFilters({ status: 'deleted', category: 'not-a-uuid', name: 'x'.repeat(201) })).toEqual(
      { status: null, categoryId: null, name: null },
    );
    expect(parseProductFilters({ status: ['draft', 'active'], name: '   ' })).toEqual({
      status: null,
      categoryId: null,
      name: null,
    });
  });

  it('writes the query string back, without empty filters', () => {
    expect(productFiltersQuery({ status: 'active', categoryId: null, name: 'red mug' })).toBe(
      'status=active&name=red+mug',
    );
    expect(productFiltersQuery({ status: null, categoryId: null, name: null })).toBe('');
    expect(hasFilters({ status: null, categoryId: null, name: null })).toBe(false);
    expect(hasFilters({ status: null, categoryId: UUID, name: null })).toBe(true);
  });
});

describe('category choices (decided 2026-10-15: Select with path labels)', () => {
  const tree: Schema<'CategoryNodeDto'>[] = [
    {
      id: 'a',
      name: 'Fashion',
      slug: 'fashion',
      sortOrder: 0,
      children: [{ id: 'b', name: 'Men', slug: 'men', sortOrder: 0, children: [] }],
    },
    { id: 'c', name: 'Home', slug: 'home', sortOrder: 1, children: [] },
  ];

  it('every level, in tree order, named by its path', () => {
    expect(categoryChoices(tree)).toEqual([
      { id: 'a', path: 'Fashion' },
      { id: 'b', path: 'Fashion › Men' },
      { id: 'c', path: 'Home' },
    ]);
  });

  it('a category missing from the active tree has no path (SE-Q-2)', () => {
    expect(categoryPath(categoryChoices(tree), 'b')).toBe('Fashion › Men');
    expect(categoryPath(categoryChoices(tree), 'gone')).toBeNull();
  });
});

describe('product form', () => {
  const product = sellerProductFactory({ name: 'Mug', description: 'Blue mug', categoryId: UUID });

  it('trims like the backend and checks lengths', () => {
    expect(productSchema.safeParse({ categoryId: UUID, name: ' M ', description: 'x' }).success).toBe(false);
    expect(productSchema.parse({ categoryId: UUID, name: ' Mug ', description: ' d ' })).toEqual({
      categoryId: UUID,
      name: 'Mug',
      description: 'd',
    });
  });

  it('PATCH sends only changed fields; nothing changed → null', () => {
    expect(productPatch({ categoryId: UUID, name: 'Mug', description: 'Blue mug' }, product)).toBeNull();
    expect(productPatch({ categoryId: UUID, name: 'Big mug', description: 'Blue mug' }, product)).toEqual({
      name: 'Big mug',
    });
  });
});

describe('variant create form (spec 02 SE-11)', () => {
  const schema = createVariantSchema(ATTRIBUTES, takenCombinations([S_RED]));
  const valid = {
    options: { [SIZE.id]: fixtureId(6002), [COLOR.id]: fixtureId(6101) },
    sku: ' MUG-M-RED ',
    price: '150',
    compareAtPrice: '',
    initialStock: '5',
    status: 'active' as const,
  };

  it('an incomplete option set can not be submitted', () => {
    const result = schema.safeParse({ ...valid, options: { [SIZE.id]: fixtureId(6002), [COLOR.id]: '' } });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['options', COLOR.id]);
  });

  it('an existing combination can not be submitted', () => {
    const result = schema.safeParse({
      ...valid,
      options: { [SIZE.id]: fixtureId(6001), [COLOR.id]: fixtureId(6101) },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('A variant with these options already exists.');
  });

  it('compare-at must be greater than the price, compared as amounts', () => {
    for (const compareAtPrice of ['150', '150.00', '99.99']) {
      const result = schema.safeParse({ ...valid, compareAtPrice });
      expect(result.error?.issues[0]?.message).toBe('The compare-at price must be greater than the price.');
    }
    expect(schema.safeParse({ ...valid, compareAtPrice: '150.01' }).success).toBe(true);
  });

  it('SKU characters, price > 0 and stock 0..100000', () => {
    expect(schema.safeParse({ ...valid, sku: 'MUG M' }).success).toBe(false);
    expect(schema.safeParse({ ...valid, price: '0' }).success).toBe(false);
    expect(schema.safeParse({ ...valid, initialStock: '100001' }).success).toBe(false);
    expect(schema.safeParse({ ...valid, initialStock: '1.5' }).success).toBe(false);
    expect(schema.safeParse({ ...valid, initialStock: '100000' }).success).toBe(true);
  });

  it('body: option ids in attribute order, trimmed SKU, empty compare-at omitted', () => {
    expect(toCreateVariantBody(schema.parse(valid), ATTRIBUTES)).toEqual({
      sku: 'MUG-M-RED',
      price: '150',
      optionIds: [fixtureId(6002), fixtureId(6101)],
      initialStock: 5,
      status: 'active',
    });
  });

  it('no attributes: no option selects, `optionIds: []` (the default variant)', () => {
    const noOptions = createVariantSchema([], new Set());
    const values = { ...emptyVariantValues([]), sku: 'ONE', price: '20' };
    expect(toCreateVariantBody(noOptions.parse(values), [])).toMatchObject({
      optionIds: [],
      status: 'active',
    });
  });
});

describe('variant edit form (spec 02 SE-11)', () => {
  const variant = sellerVariantFactory({ sku: 'A-1', price: '150.00', compareAtPrice: '200.00' });

  it('sends only changed fields; the same amount written differently is unchanged', () => {
    const values = editVariantSchema.parse({
      sku: 'A-1',
      price: '150',
      compareAtPrice: '200',
      status: 'active',
    });
    expect(variantPatch(values, variant)).toBeNull();
  });

  it('a cleared compare-at is sent as null', () => {
    const values = editVariantSchema.parse({
      sku: 'A-1',
      price: '150.00',
      compareAtPrice: '',
      status: 'inactive',
    });
    expect(variantPatch(values, variant)).toEqual({ compareAtPrice: null, status: 'inactive' });
  });
});

describe('variant helpers', () => {
  it('options label with attribute names; "Default" for the default variant', () => {
    expect(variantOptionsLabel(S_RED, ATTRIBUTES)).toBe('Size: S · Color: Red');
    expect(variantOptionsLabel(S_RED, [])).toBe('size: S · color: Red');
    expect(variantOptionsLabel(sellerVariantFactory(), ATTRIBUTES)).toBe('Default');
  });

  it('options that would repeat an existing combination, once the other attributes are chosen', () => {
    const taken = takenCombinations([S_RED]);
    expect([...takenOptionIds(ATTRIBUTES, { [SIZE.id]: '', [COLOR.id]: '' }, SIZE.id, taken)]).toEqual([]);
    expect([
      ...takenOptionIds(ATTRIBUTES, { [SIZE.id]: '', [COLOR.id]: fixtureId(6101) }, SIZE.id, taken),
    ]).toEqual([fixtureId(6001)]);
    expect(optionSignature(['b', 'a'])).toBe(optionSignature(['a', 'b']));
  });

  it('last active variant of a published product', () => {
    const active = sellerVariantFactory();
    const other = sellerVariantFactory({ status: 'inactive' });
    const product = sellerProductFactory({ status: 'active', variants: [active, other] });
    expect(isLastActiveVariant(product, active)).toBe(true);
    expect(isLastActiveVariant(product, other)).toBe(false);
    expect(isLastActiveVariant({ ...product, status: 'inactive' }, active)).toBe(false);
    expect(isLastActiveVariant({ ...product, variants: [active, sellerVariantFactory()] }, active)).toBe(
      false,
    );
  });

  it('a category without attributes takes one variant only', () => {
    const empty = sellerProductFactory();
    expect(canAddVariant(empty, [])).toBe(true);
    expect(canAddVariant({ ...empty, variants: [sellerVariantFactory()] }, [])).toBe(false);
    expect(canAddVariant({ ...empty, variants: [S_RED] }, ATTRIBUTES)).toBe(true);
  });

  it('VARIANT_OPTIONS_INVALID details point at their attributes (option id or attribute code)', () => {
    expect(
      attributesWithProblems(
        [{ value: fixtureId(6102) }, { value: 'size' }, { value: 'gone' }, {}],
        ATTRIBUTES,
      ).sort(),
    ).toEqual([SIZE.id, COLOR.id].sort());
  });
});
