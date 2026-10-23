import { describe, expect, it } from 'vitest';
import { findCategoryPath, type CategoryNode } from './category-tree';

let sequence = 0;
const node = (slug: string, children: CategoryNode[] = []): CategoryNode => {
  sequence += 1;
  return { id: `id-${sequence}`, name: slug.toUpperCase(), slug, sortOrder: sequence, image: null, children };
};

const TREE = [
  node('electronics', [node('audio'), node('phones')]),
  node('sports', [node('running', [node('running-shoes')])]),
  node('home'),
];

const slugs = (path: CategoryNode[] | null) => path?.map((n) => n.slug) ?? null;

describe('findCategoryPath', () => {
  it.each([
    ['electronics', ['electronics']],
    ['phones', ['electronics', 'phones']],
    ['running-shoes', ['sports', 'running', 'running-shoes']],
    ['home', ['home']],
  ])('%s → root-first path', (slug, expected) => {
    expect(slugs(findCategoryPath(TREE, slug))).toEqual(expected);
  });

  it.each(['unknown', '', 'Running-Shoes', 'running-shoe'])('%j → null (not found)', (slug) => {
    expect(findCategoryPath(TREE, slug)).toBeNull();
  });

  it('handles an empty tree', () => {
    expect(findCategoryPath([], 'home')).toBeNull();
  });
});
