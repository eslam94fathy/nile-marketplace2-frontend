import { PageHeader } from '@nile/ui';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { CATALOG_COPY } from '../copy';
import { categoryHref } from '../lib/category-href';
import type { CategoryNode } from '../lib/category-tree';

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
      <nav aria-label={CATALOG_COPY.breadcrumb}>
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link href={ROUTES.home} className="hover:text-foreground hover:underline">
              {CATALOG_COPY.home}
            </Link>
          </li>
          {path.map((node) => (
            <li key={node.id} className="flex items-center gap-1">
              <span aria-hidden="true">›</span>
              {node === current ? (
                <span aria-current="page" className="text-foreground">
                  {node.name}
                </span>
              ) : (
                <Link href={categoryHref(node.slug)} className="hover:text-foreground hover:underline">
                  {node.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
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
