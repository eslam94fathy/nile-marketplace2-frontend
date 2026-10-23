import { fixtureId } from '@nile/test-utils';
import { describe, expect, it } from 'vitest';
import type { CategoryAttribute, CategoryNode } from '../api';
import { categoryPatch, categorySchema, toCreateCategoryBody } from '../schemas';
import {
  canHaveChildren,
  effectiveAttributeCount,
  findNode,
  inheritedAttributes,
  nextSortOrder,
  pathTo,
  sortedNodes,
} from './tree';

const attribute = (id: number, name: string, sortOrder = 0): CategoryAttribute => ({
  id: fixtureId(id),
  code: name.toLowerCase(),
  name,
  sortOrder,
  options: [],
});

const node = (id: number, depth: number, overrides: Partial<CategoryNode> = {}): CategoryNode => ({
  id: fixtureId(id),
  parentId: null,
  name: `Category ${String(id)}`,
  slug: `category-${String(id)}`,
  depth,
  sortOrder: 0,
  isActive: true,
  attributes: [],
  children: [],
  ...overrides,
});

const LEAF = node(3, 3, { attributes: [attribute(103, 'Fit')] });
const MIDDLE = node(2, 2, {
  attributes: [attribute(102, 'Color', 1), attribute(104, 'Size', 0)],
  children: [LEAF],
});
const ROOT = node(1, 1, { attributes: [attribute(101, 'Material')], children: [MIDDLE], sortOrder: 5 });
const TREE = [ROOT, node(9, 1, { sortOrder: 2 })];

describe('category tree (spec 03 AD-07)', () => {
  it('path, lookup and order', () => {
    expect(pathTo(TREE, LEAF.id).map((item) => item.depth)).toEqual([1, 2, 3]);
    expect(findNode(TREE, MIDDLE.id)?.name).toBe('Category 2');
    expect(findNode(TREE, fixtureId(999))).toBeUndefined();
    expect(sortedNodes(TREE).map((item) => item.sortOrder)).toEqual([2, 5]);
  });

  it('inherited attributes by depth then sort order; the effective count includes own ones', () => {
    expect(
      inheritedAttributes(TREE, LEAF.id).map(
        ({ attribute: item, from }) => `${item.name}@${String(from.depth)}`,
      ),
    ).toEqual(['Material@1', 'Size@2', 'Color@2']);
    expect(effectiveAttributeCount(TREE, LEAF.id)).toBe(4);
    expect(inheritedAttributes(TREE, ROOT.id)).toEqual([]);
  });

  it('no subcategories at depth 3 [SPEC 06 Q-30]', () => {
    expect(canHaveChildren(MIDDLE)).toBe(true);
    expect(canHaveChildren(LEAF)).toBe(false);
  });

  it('default sort order: after the last sibling, capped at 10000', () => {
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder([{ sortOrder: 3 }, { sortOrder: 7 }])).toBe(8);
    expect(nextSortOrder([{ sortOrder: 10_000 }])).toBe(10_000);
  });
});

describe('category form', () => {
  it('an empty slug is left to the backend on create; a parent id only for subcategories', () => {
    const values = categorySchema.parse({ name: ' Shirts ', slug: '', sortOrder: '3' });
    expect(toCreateCategoryBody(values, null)).toEqual({ name: 'Shirts', sortOrder: 3 });
    expect(
      toCreateCategoryBody(categorySchema.parse({ name: 'A', slug: 'a-b', sortOrder: '0' }), ROOT.id),
    ).toEqual({
      parentId: ROOT.id,
      name: 'A',
      slug: 'a-b',
      sortOrder: 0,
    });
  });

  it('slug rule, sort order range', () => {
    expect(categorySchema.safeParse({ name: 'A', slug: 'Bad Slug', sortOrder: '1' }).success).toBe(false);
    expect(categorySchema.safeParse({ name: 'A', slug: '', sortOrder: '10001' }).success).toBe(false);
    expect(categorySchema.safeParse({ name: 'A', slug: '', sortOrder: '-1' }).success).toBe(false);
  });

  it('PATCH: changed fields only; an emptied slug keeps the current one', () => {
    const values = categorySchema.parse({ name: ROOT.name, slug: '', sortOrder: '6' });
    expect(categoryPatch(values, ROOT)).toEqual({ sortOrder: 6 });
    expect(
      categoryPatch(categorySchema.parse({ name: ROOT.name, slug: ROOT.slug, sortOrder: '5' }), ROOT),
    ).toBeNull();
  });
});
