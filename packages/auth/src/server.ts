import 'server-only';

// Server entry of @nile/auth (design 01 §2). Route handlers and session helpers; never imported by client
// components (`server-only` fails the build if one does). The client entry arrives with T-D2.
export { APP_ROLES, BFF_ROUTE_PREFIX, DEVICE_NAMES, type AuthAppConfig } from './config';
export { cookieNames, type CookieNames } from './cookies';
export {
  createAuthRouteHandler,
  createBffRouteHandler,
  type AuthAction,
  type AuthRouteContext,
} from './route-handlers';
export type { SessionKeyRing, SessionUser, SessionV1, UserRole } from './session';
