import { NILE, SEMANTIC_COLORS } from './tokens';

// The web app manifest every app serves (design 01 §15.5, FR2-Q2): installable from the Home Screen, which
// iPhone and iPad need for Web Push. No offline mode: the service worker has no fetch handler.

/** The brand icons copied into each app's `public/icons/` (T-J2). */
export const MANIFEST_ICONS = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
] as const;

/** The manifest of an app named `name` ("Nile", "Nile Seller", …); returned by each app's `app/manifest.ts`. */
export function webAppManifest(name: string) {
  return {
    name,
    short_name: name,
    start_url: '/',
    scope: '/',
    display: 'standalone' as const,
    background_color: SEMANTIC_COLORS.background,
    // The brand navy of the header and the app icon (T-J2).
    theme_color: NILE[900],
    icons: MANIFEST_ICONS.map((icon) => ({ ...icon })),
  };
}
