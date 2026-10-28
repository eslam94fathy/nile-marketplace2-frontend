import 'server-only';

// Server entry of @nile/auth (design 01 §2). Route handlers, route guard and DAL; never imported by client
// components (`server-only` fails the build if one does). Browser code uses `@nile/auth/client`.
export { APP_ROLES, BFF_ROUTE_PREFIX, DEVICE_NAMES, type AuthAppConfig } from './config';
export { cookieNames, type CookieNames } from './cookies';
export { createDal, type CurrentSession, type Dal } from './dal';
export { CSP_REPORT_ONLY, type CspOrigins } from './headers';
export { safeReturnTo, type ReturnToOptions } from './return-to';
export {
  createRouteGuard,
  loginRedirectPath,
  PATHNAME_HEADER,
  RETURN_TO_PARAM,
  type RouteGuardConfig,
} from './route-guard';
export {
  createAuthRouteHandler,
  createBffRouteHandler,
  type AuthAction,
  type AuthRouteContext,
} from './route-handlers';
export type { SessionKeyRing, SessionUser, SessionV1, UserRole } from './session';
