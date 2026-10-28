// A notification's `link` is a route of one prefixed web app (backend spec 13 NO-12, NO-31…NO-35). Each app
// maps the patterns it owns to its own routes and shows any other link without one (spec 00 §12.5, FR2-Q4).

type ParamNames<P extends string> = P extends `${string}{${infer Name}}${infer Rest}`
  ? Name | ParamNames<Rest>
  : never;

/** The `{name}` segments of an API link pattern, e.g. `{ orderId: string }` for `/orders/{orderId}`. */
export type NotificationLinkParams<P extends string> = Readonly<Record<ParamNames<P>, string>>;

/** API link pattern → the app path it opens. */
export type NotificationLinkMap = Readonly<
  Record<string, (params: Readonly<Record<string, string>>) => string>
>;

/** Typed constructor for an app's map: each target gets exactly the parameters of its pattern. */
export function defineNotificationLinks<
  const M extends { readonly [P in keyof M & string]: (params: NotificationLinkParams<P>) => string },
>(map: M): NotificationLinkMap & M {
  return map;
}

/** Ids in links are UUIDs; anything else in a parameter position (dots, encoded slashes) doesn't match. */
const PARAM_VALUE = /^[A-Za-z0-9_-]{1,64}$/;
const PARAM_SEGMENT = /^\{(\w+)\}$/;
/** A relative path of plain segments: no scheme, host, `//`, backslash, dot segment, query or fragment. */
const RELATIVE_LINK = /^(\/[A-Za-z0-9_-]+)+$/;

function matchPattern(pattern: string, segments: readonly string[]): Record<string, string> | null {
  const parts = pattern.split('/').slice(1);
  if (parts.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (const [index, part] of parts.entries()) {
    const segment = segments[index] ?? '';
    const name = PARAM_SEGMENT.exec(part)?.[1];
    if (name === undefined) {
      if (part !== segment) return null;
    } else if (PARAM_VALUE.test(segment)) {
      params[name] = segment;
    } else {
      return null;
    }
  }
  return params;
}

/** A same-origin path: starts with one `/` (never `//`, which a browser reads as another host). */
function isSameOriginPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\');
}

/**
 * The app path for an API notification link, or null when the link is missing, malformed, another app's, or
 * an unknown pattern (shown without a link). The result is always a same-origin path (CLAUDE.md §9.4).
 */
export function mapNotificationLink(
  map: NotificationLinkMap,
  link: string | null | undefined,
): string | null {
  if (link === null || link === undefined || !RELATIVE_LINK.test(link)) return null;
  const segments = link.split('/').slice(1);
  for (const [pattern, target] of Object.entries(map)) {
    const params = matchPattern(pattern, segments);
    if (params === null) continue;
    const path = target(params);
    return isSameOriginPath(path) ? path : null;
  }
  return null;
}
