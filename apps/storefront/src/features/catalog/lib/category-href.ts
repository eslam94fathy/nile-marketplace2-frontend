/** The category page of `slug` (spec 01 SF-02). Slugs are lower-case kebab-case, safe in a path. */
export function categoryHref(slug: string): `/c/${string}` {
  return `/c/${slug}`;
}
