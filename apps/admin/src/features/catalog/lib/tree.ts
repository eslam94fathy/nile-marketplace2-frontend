import type { CategoryAttribute, CategoryNode } from '../api';

// Reading the admin category tree (spec 03 AD-07, [SPEC 06] UC-CA-1/2). Depth: root = 1, at most 3.

export const MAX_DEPTH = 3;
/** Effective attributes (own + inherited) per category [SPEC 06]. */
export const MAX_EFFECTIVE_ATTRIBUTES = 5;
export const SORT_ORDER_MAX = 10_000;

const bySortOrder = <T extends { readonly sortOrder: number }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => a.sortOrder - b.sortOrder);

/** Children (or roots) in display order. */
export const sortedNodes = (nodes: readonly CategoryNode[]): CategoryNode[] => bySortOrder(nodes);
export const sortedAttributes = (attributes: readonly CategoryAttribute[]): CategoryAttribute[] =>
  bySortOrder(attributes);

/** The node and its ancestors, root first; empty when the id isn't in the tree. */
export function pathTo(tree: readonly CategoryNode[], id: string): CategoryNode[] {
  for (const node of tree) {
    if (node.id === id) return [node];
    const below = pathTo(node.children, id);
    if (below.length > 0) return [node, ...below];
  }
  return [];
}

export const findNode = (tree: readonly CategoryNode[], id: string): CategoryNode | undefined =>
  pathTo(tree, id).at(-1);

export interface InheritedAttribute {
  readonly attribute: CategoryAttribute;
  /** The ancestor that owns it. */
  readonly from: CategoryNode;
}

/** Attributes the ancestors define, ordered by depth then sort order (as the backend's effective list). */
export function inheritedAttributes(tree: readonly CategoryNode[], id: string): InheritedAttribute[] {
  return pathTo(tree, id)
    .slice(0, -1)
    .flatMap((ancestor) =>
      sortedAttributes(ancestor.attributes).map((attribute) => ({ attribute, from: ancestor })),
    );
}

/** Own + inherited, for "Effective attributes: {n} of 5". */
export function effectiveAttributeCount(tree: readonly CategoryNode[], id: string): number {
  return pathTo(tree, id).reduce((count, node) => count + node.attributes.length, 0);
}

/** A default sort order after the last sibling [PROPOSED in spec 03], capped at the API's maximum. */
export function nextSortOrder(siblings: readonly { readonly sortOrder: number }[]): number {
  const largest = siblings.reduce((max, item) => Math.max(max, item.sortOrder), -1);
  return Math.min(largest + 1, SORT_ORDER_MAX);
}

/** Subcategories are possible below depth 3 [SPEC 06 Q-30]. */
export const canHaveChildren = (node: CategoryNode): boolean => node.depth < MAX_DEPTH;
