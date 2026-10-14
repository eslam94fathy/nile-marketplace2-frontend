// The four apps as E2E targets: ports from CLAUDE.md §2, titles from each app's `src/lib/app.ts`.
export const E2E_APPS = {
  storefront: { port: 4100, title: 'Nile' },
  seller: { port: 4101, title: 'Nile Seller' },
  admin: { port: 4102, title: 'Nile Admin' },
  agent: { port: 4103, title: 'Nile Delivery' },
} as const;

export type E2eAppName = keyof typeof E2E_APPS;

export const E2E_APP_NAMES = Object.keys(E2E_APPS) as E2eAppName[];

export const appUrl = (app: E2eAppName): string => `http://localhost:${E2E_APPS[app].port}`;

/** Storefront token page (T-C1). */
export const TOKEN_PAGE_PATH = '/design/tokens';
