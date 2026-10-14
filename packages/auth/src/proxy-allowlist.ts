import { BFF_ALLOW_LISTS, type AllowedOperation, type BffApp } from '@nile/api';

// Matches an incoming BFF path against the app's allow-list (design 01 §4.2 step 3). Templates become
// anchored regexes; ids must be UUID-shaped and the product `idOrSlug` slug-shaped, so encoded slashes,
// dot segments or anything else unexpected never reach the backend.

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
// A lower-case slug; a UUID matches it too, which is what the product route accepts.
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const MAX_PATH_LENGTH = 512;

const PARAMETER_PATTERNS: Readonly<Record<string, string>> = { idOrSlug: SLUG };

interface CompiledOperation {
  operation: AllowedOperation;
  pattern: RegExp;
}

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function compileTemplate(template: string): RegExp {
  const source = template
    .split('/')
    .map((segment) => {
      const parameter = /^\{(\w+)\}$/.exec(segment)?.[1];
      if (parameter === undefined) return escapeLiteral(segment);
      return PARAMETER_PATTERNS[parameter] ?? UUID;
    })
    .join('/');
  return new RegExp(`^${source}$`);
}

export interface AllowListMatcher {
  /** The allowed operation for `METHOD path` (path below `/api/v1`, no query), or null. */
  match(method: string, path: string): AllowedOperation | null;
}

export function createAllowListMatcher(app: BffApp): AllowListMatcher {
  const compiled: CompiledOperation[] = BFF_ALLOW_LISTS[app].map((operation) => ({
    operation,
    pattern: compileTemplate(operation.path),
  }));
  return {
    match(method, path) {
      if (path.length > MAX_PATH_LENGTH) return null;
      const upper = method.toUpperCase();
      return (
        compiled.find((entry) => entry.operation.method === upper && entry.pattern.test(path))?.operation ??
        null
      );
    },
  };
}
