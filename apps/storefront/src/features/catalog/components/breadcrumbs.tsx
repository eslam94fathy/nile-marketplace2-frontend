import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { CATALOG_COPY } from '../copy';

export interface Crumb {
  readonly name: string;
  /** Ancestor crumbs are always category pages. */
  readonly href: `/c/${string}`;
}

/** Home › links › current (spec 01 SF-02, SF-05); the current page is marked, not linked. */
export function Breadcrumbs({
  links,
  current,
}: {
  readonly links: readonly Crumb[];
  readonly current: string;
}) {
  return (
    <nav aria-label={CATALOG_COPY.breadcrumb}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <li>
          <Link href={ROUTES.home} className="hover:text-foreground hover:underline">
            {CATALOG_COPY.home}
          </Link>
        </li>
        {links.map((crumb) => (
          <li key={crumb.href} className="flex items-center gap-1">
            <span aria-hidden="true">›</span>
            <Link href={crumb.href} className="hover:text-foreground hover:underline">
              {crumb.name}
            </Link>
          </li>
        ))}
        <li className="flex items-center gap-1">
          <span aria-hidden="true">›</span>
          <span aria-current="page" className="text-foreground">
            {current}
          </span>
        </li>
      </ol>
    </nav>
  );
}
