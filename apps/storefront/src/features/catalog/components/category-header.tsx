import { PageHeader } from '@nile/ui';
import Link from 'next/link';
import { CATALOG_COPY } from '../copy';
import { categoryHref } from '../lib/category-href';
import type { CategoryNode } from '../lib/category-tree';
import { Breadcrumbs } from './breadcrumbs';

const CHIP =
  'inline-flex items-center rounded-full border border-border px-3 py-1 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring';

/**
 * Top of a category page (spec 01 SF-02): breadcrumbs Home › ancestors › current, the title, and the direct
 * subcategories as chips. `path` is root first, ending with the current category.
 */
export function CategoryHeader({ path }: { readonly path: readonly CategoryNode[] }) {
  const current = path.at(-1);
  if (current === undefined) return null;
  return (
    <div className="space-y-4">
      <Breadcrumbs
        links={path.slice(0, -1).map((node) => ({ name: node.name, href: categoryHref(node.slug) }))}
        current={current.name}
      />
      <PageHeader title={current.name} />
      {current.children.length === 0 ? null : (
        <nav aria-label={CATALOG_COPY.subcategories}>
          <ul className="flex flex-wrap gap-2">
            {current.children.map((child) => (
              <li key={child.id}>
                <Link href={categoryHref(child.slug)} className={CHIP}>
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
