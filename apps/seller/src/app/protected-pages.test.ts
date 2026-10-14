import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isProtectedPath } from '../lib/access';

// Every page on a protected path checks the session itself (architecture §5.5): proxy.ts alone is not enough.

const APP_DIR = import.meta.dirname;

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? pages(join(dir, entry.name))
      : entry.name === 'page.tsx'
        ? [join(dir, entry.name)]
        : [],
  );
}

/** `(portal)/orders/page.tsx` → `/orders` (route groups don't appear in the URL). */
function routeOf(file: string): string {
  const segments = relative(APP_DIR, file)
    .split(sep)
    .slice(0, -1)
    .filter((segment) => !/^\(.*\)$/.test(segment));
  return `/${segments.join('/')}`;
}

describe('protected pages', () => {
  const all = pages(APP_DIR).map((file) => ({ file, route: routeOf(file) }));
  const protectedPages = all.filter(({ route }) => isProtectedPath(route));

  it('finds pages to check', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it.each(protectedPages.map(({ route, file }) => [route, file]))('%s calls requireSession()', (_, file) => {
    expect(readFileSync(file, 'utf8')).toContain('await requireSession()');
  });
});
