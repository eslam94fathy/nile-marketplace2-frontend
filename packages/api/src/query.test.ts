import { describe, expect, it } from 'vitest';
import { InvalidQueryError, inValues, productQuery, serializeQuery } from './query';

const CATEGORY = '01a125e5-0e14-763a-a68f-005e0439cf6c';

describe('inValues', () => {
  it('joins values with commas', () => {
    expect(inValues(['placed', 'in_progress'])).toBe('placed,in_progress');
  });

  it.each([[[]], [['']], [['a,b']]])('rejects %j', (values) => {
    expect(() => inValues(values)).toThrow(InvalidQueryError);
  });
});

describe('productQuery', () => {
  it('passes plain filters through unchanged', () => {
    expect(productQuery({ q: 'shirt', limit: 20 })).toEqual({ q: 'shirt', limit: 20 });
  });

  it('adds attr.<code>[in] parameters', () => {
    expect(
      productQuery({ 'categoryId[eq]': CATEGORY, attributes: { color: ['red', 'navy-blue'], size: ['m'] } }),
    ).toEqual({ 'categoryId[eq]': CATEGORY, 'attr.color[in]': 'red,navy-blue', 'attr.size[in]': 'm' });
  });

  it.each([
    ['attributes without a category', { attributes: { color: ['red'] } }, /need categoryId/],
    [
      'more than 5 attributes',
      {
        'categoryId[eq]': CATEGORY,
        attributes: { a: ['x'], b: ['x'], c: ['x'], d: ['x'], e: ['x'], f: ['x'] },
      },
      /at most 5/,
    ],
    [
      'more than 20 values',
      { 'categoryId[eq]': CATEGORY, attributes: { color: Array.from({ length: 21 }, (_, i) => `c${i}`) } },
      /at most 20/,
    ],
    [
      'an invalid attribute code',
      { 'categoryId[eq]': CATEGORY, attributes: { 'Bad Code': ['x'] } },
      /attribute code/,
    ],
    [
      'an invalid option code',
      { 'categoryId[eq]': CATEGORY, attributes: { color: ['Red!'] } },
      /option code/,
    ],
    ['an empty value list', { 'categoryId[eq]': CATEGORY, attributes: { color: [] } }, /at least one value/],
    ['relevance without q', { sort: '-relevance' as const }, /relevance needs a search text/],
  ])('rejects %s', (_label, input, message) => {
    expect(() => productQuery(input)).toThrow(message);
  });

  it('allows relevance with q', () => {
    expect(productQuery({ q: 'shirt', sort: '-relevance' })).toEqual({ q: 'shirt', sort: '-relevance' });
  });
});

describe('serializeQuery', () => {
  it('keeps keys literal and skips undefined and null', () => {
    const query = serializeQuery({
      'createdAt[gte]': '2026-01-01',
      'status[in]': 'a,b',
      cursor: undefined,
      x: null,
    });
    expect([...new URLSearchParams(query).entries()]).toEqual([
      ['createdAt[gte]', '2026-01-01'],
      ['status[in]', 'a,b'],
    ]);
  });

  it('serializes numbers and booleans', () => {
    expect(serializeQuery({ limit: 50, 'inStock[eq]': false })).toBe('limit=50&inStock%5Beq%5D=false');
  });

  it.each([[['a', 'b']], [{ nested: 1 }]])('refuses %j (use inValues)', (value) => {
    expect(() => serializeQuery({ 'status[in]': value })).toThrow(InvalidQueryError);
  });
});
