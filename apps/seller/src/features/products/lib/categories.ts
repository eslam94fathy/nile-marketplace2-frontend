import type { CategoryNode } from '../api';

// The public category tree as the seller sees it (spec 02 SE-08, SE-09): one option per active category at
// any level, in tree order, named by its full path (decided 2026-10-15: Select with path labels).

export const CATEGORY_PATH_SEPARATOR = ' › ';

export interface CategoryChoice {
  readonly id: string;
  readonly path: string;
}

export function categoryChoices(
  tree: readonly CategoryNode[],
  parents: readonly string[] = [],
): CategoryChoice[] {
  return tree.flatMap((node) => {
    const names = [...parents, node.name];
    return [
      { id: node.id, path: names.join(CATEGORY_PATH_SEPARATOR) },
      ...categoryChoices(node.children, names),
    ];
  });
}

/**
 * The category's path, or null when it isn't in the active tree: deactivated since, and sellers can't read
 * inactive categories (SE-Q-2: shown as "Unavailable category").
 */
export function categoryPath(choices: readonly CategoryChoice[], categoryId: string): string | null {
  return choices.find((choice) => choice.id === categoryId)?.path ?? null;
}
