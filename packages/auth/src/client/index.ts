// Client entry of @nile/auth (design 01 §2): refresh coordinator, sign-out, session boundary. No token, key
// or cookie secret is reachable from here; the browser only ever sees the session-version cookie.
export {
  AUTH_ROUTES,
  createSessionClient,
  LOGIN_PARAMS,
  MIN_REFRESH_INTERVAL_MS,
  SESSION_ENDED_NOTICE,
  sessionVersionCookieNames,
  type BrowserEnvironment,
  type RefreshOutcome,
  type SessionClient,
  type SessionClientOptions,
  type SignOutReason,
} from './session-client';
export { BFF_ROUTE_PREFIX } from '../config';
export { signIn, verifyEmailAndSignIn, wrongAppRole, type SignedInUser } from './auth-requests';
export { safeReturnTo, type ReturnToOptions } from '../return-to';
export { SessionExpiredBoundary, SessionManager, type SessionExpiredBoundaryProps } from './components';
