// The four apps as E2E targets: ports from CLAUDE.md §2, titles from each app's `src/lib/app.ts`, landing
// headings from the T-C3 placeholder pages.
export const E2E_APPS = {
  storefront: { port: 4100, title: 'Nile', landing: 'Home' },
  seller: { port: 4101, title: 'Nile Seller', landing: 'Overview' },
  admin: { port: 4102, title: 'Nile Admin', landing: 'Dashboard' },
  agent: { port: 4103, title: 'Nile Delivery', landing: 'Shipments' },
} as const;

/** Breakpoints every shell must work at (conventions §10). */
export const VIEWPORTS = {
  phone: { width: 360, height: 800 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
} as const;

export type E2eAppName = keyof typeof E2E_APPS;

export const E2E_APP_NAMES = Object.keys(E2E_APPS) as E2eAppName[];

export const appUrl = (app: E2eAppName): string => `http://localhost:${E2E_APPS[app].port}`;

/** Storefront token page (T-C1). */
export const TOKEN_PAGE_PATH = '/design/tokens';

/** Storefront component gallery (T-C2). */
export const COMPONENT_GALLERY_PATH = '/design/components';
