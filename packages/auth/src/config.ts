import type { BffApp } from '@nile/api';
import type { Logger } from '@nile/logger';
import type { SessionKeyRing, UserRole } from './session';

/** The one role each app accepts at login (CLAUDE.md §4, FQ-1). */
export const APP_ROLES: Readonly<Record<BffApp, UserRole>> = {
  storefront: 'customer',
  seller: 'seller',
  admin: 'admin',
  agent: 'delivery_agent',
};

/** `deviceName` sent at login, stored by the backend for session auditing (specs 01–04, sign-in screens). */
export const DEVICE_NAMES: Readonly<Record<BffApp, string>> = {
  storefront: 'Web (storefront)',
  seller: 'Web (seller)',
  admin: 'Web (admin)',
  agent: 'Web (agent)',
};

/** Path of the proxy route; the rest of the URL path is the backend path below /api/v1. */
export const BFF_ROUTE_PREFIX = '/api/bff';

/** What the auth and proxy routes need from the app, built from its validated server env. */
export interface AuthAppConfig {
  app: BffApp;
  /** `APP_ORIGIN`, compared with the `Origin` header of every mutating request. */
  appOrigin: string;
  /** `NILE_API_BASE_URL`. */
  apiBaseUrl: string;
  sessionKeys: SessionKeyRing;
  cookieSecure: boolean;
  refreshSkewSeconds: number;
  upstreamTimeoutMs: number;
  maxBodyBytes: number;
  logger: Logger;
  /** Tests only: replaces the network. */
  fetch?: (request: Request) => Promise<Response>;
  /** Tests only: fixed clock. */
  now?: () => Date;
}
