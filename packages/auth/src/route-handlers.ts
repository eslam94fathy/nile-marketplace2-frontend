import {
  ApiError,
  createApiClient,
  fetchWithTimeout,
  forwardToBackend,
  HEADER,
  isApiError,
  serverTransport,
  unwrap,
  type ApiClient,
  type BffApp,
} from '@nile/api';
import type { Logger } from '@nile/logger';
import type { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { APP_ROLES, BFF_ROUTE_PREFIX, DEVICE_NAMES, type AuthAppConfig } from './config';
import { clearSessionCookies, cookieNames, writeSessionCookies } from './cookies';
import { checkCsrf } from './csrf';
import {
  apiErrorResponse,
  correlationIdOf,
  errorResponse,
  NO_STORE,
  noContentResponse,
  okResponse,
  readJsonBody,
} from './http';
import { createAllowListMatcher } from './proxy-allowlist';
import {
  accessTokenRemainingMs,
  sealSession,
  bodyTokens,
  sessionFromTokens,
  unsealSession,
  type BodyAuthTokens,
  type SessionV1,
} from './session';

// The app's own server routes (design 01 §4): /api/auth/[action] (sign-in, refresh, sign-out) and the
// /api/bff/[...path] proxy. Tokens exist only here and in the encrypted cookie; no response body carries one.

interface RequestContext {
  config: AuthAppConfig;
  correlationId: string;
  log: Logger;
  now: Date;
  cookieOptions: { names: ReturnType<typeof cookieNames>; secure: boolean };
}

function contextFor(request: Request, config: AuthAppConfig): RequestContext {
  const correlationId = correlationIdOf(request);
  return {
    config,
    correlationId,
    log: config.logger.child({ correlationId }),
    now: config.now?.() ?? new Date(),
    cookieOptions: { names: cookieNames(config.app, config.cookieSecure), secure: config.cookieSecure },
  };
}

function backendClient(ctx: RequestContext, accessToken?: string): ApiClient {
  return createApiClient(
    serverTransport({
      baseUrl: ctx.config.apiBaseUrl,
      correlationId: ctx.correlationId,
      fetch: fetchWithTimeout(ctx.config.upstreamTimeoutMs, ctx.config.fetch),
      ...(accessToken === undefined ? {} : { accessToken }),
    }),
  );
}

interface SessionRead {
  session: SessionV1 | null;
  /** A cookie was sent but isn't a usable session (tampered, unknown key, expired, other role). */
  invalidCookie: boolean;
}

async function readSession(request: NextRequest, ctx: RequestContext): Promise<SessionRead> {
  const cookie = request.cookies.get(ctx.cookieOptions.names.session)?.value;
  if (cookie === undefined || cookie === '') return { session: null, invalidCookie: false };
  const session = await unsealSession(cookie, ctx.config.sessionKeys, ctx.now);
  if (session?.user.role !== APP_ROLES[ctx.config.app]) return { session: null, invalidCookie: true };
  return { session, invalidCookie: false };
}

async function sessionResponse(
  response: NextResponse,
  tokens: BodyAuthTokens,
  ctx: RequestContext,
): Promise<NextResponse> {
  const session = sessionFromTokens(tokens, ctx.now);
  const sealed = await sealSession(session, ctx.config.sessionKeys);
  writeSessionCookies(response, sealed, session, ctx.now, ctx.cookieOptions);
  return response;
}

/** Revokes a refresh token at the backend. Best effort: logout always answers 204, failures are only logged. */
async function revoke(refreshToken: string, ctx: RequestContext): Promise<void> {
  try {
    await unwrap(backendClient(ctx).POST('/api/v1/auth/logout', { body: { refreshToken } }));
  } catch (error) {
    ctx.log.warn('LOGOUT_FAILED', { error });
  }
}

function unauthenticated(ctx: RequestContext, clearCookies: boolean): NextResponse {
  const response = errorResponse(401, 'UNAUTHENTICATED', 'Sign in required', ctx.correlationId);
  if (clearCookies) clearSessionCookies(response, ctx.cookieOptions);
  return response;
}

function validationFailed(error: z.ZodError, ctx: RequestContext): NextResponse {
  return errorResponse(400, 'VALIDATION_FAILED', 'Invalid request body', ctx.correlationId, {
    details: error.issues.map((issue) => ({
      field: issue.path.join('.'),
      constraint: issue.code,
      message: issue.message,
    })),
  });
}

type Parsed<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

async function parseBody<T>(request: Request, schema: z.ZodType<T>, ctx: RequestContext): Promise<Parsed<T>> {
  const body = await readJsonBody(request, ctx.config.maxBodyBytes, ctx.correlationId);
  if (!body.ok) return body;
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return {
      ok: false,
      response: errorResponse(400, 'MALFORMED_JSON', 'Request body is not valid JSON', ctx.correlationId),
    };
  }
  const parsed = schema.safeParse(json);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, response: validationFailed(parsed.error, ctx) };
}

// Only the shape is checked here; the backend validates content (format, lengths) and answers by code.
const loginBodySchema = z.strictObject({ email: z.string(), password: z.string() });

/**
 * Turns tokens from a sign-in style call (login, email verification) into this app's session: another role
 * gets WRONG_APP and its new session is revoked at once with no cookie written (design 01 §4.1); a sign-in
 * over an existing session ends the old one so its refresh token doesn't linger.
 */
async function startSession(
  request: NextRequest,
  tokens: BodyAuthTokens,
  event: string,
  ctx: RequestContext,
): Promise<NextResponse> {
  const previous = await readSession(request, ctx);
  if (tokens.user.role !== APP_ROLES[ctx.config.app]) {
    await revoke(tokens.refreshToken, ctx);
    ctx.log.warn('LOGIN_WRONG_APP', { userId: tokens.user.id, role: tokens.user.role, event });
    return errorResponse(
      403,
      'WRONG_APP',
      `This account can't sign in to the ${ctx.config.app} app`,
      ctx.correlationId,
      {
        details: [
          {
            field: 'role',
            constraint: 'app',
            message: 'role not accepted by this app',
            value: tokens.user.role,
          },
        ],
      },
    );
  }
  if (previous.session !== null) await revoke(previous.session.refreshToken, ctx);
  ctx.log.info(event, { userId: tokens.user.id });
  return sessionResponse(okResponse({ user: tokens.user }, ctx.correlationId), tokens, ctx);
}

async function login(request: NextRequest, ctx: RequestContext): Promise<NextResponse> {
  const body = await parseBody(request, loginBodySchema, ctx);
  if (!body.ok) return body.response;
  const { data } = await unwrap(
    backendClient(ctx).POST('/api/v1/auth/login', {
      body: {
        email: body.value.email,
        password: body.value.password,
        deviceName: DEVICE_NAMES[ctx.config.app],
      },
    }),
  );
  return startSession(request, bodyTokens(data), 'LOGIN_SUCCEEDED', ctx);
}

const verifyEmailBodySchema = z.strictObject({ email: z.string(), otp: z.string() });

/** Apps with self-registration, whose users verify their email (design 01 §4.1). */
const VERIFY_EMAIL_APPS: readonly BffApp[] = ['storefront', 'seller'];

/** Email verification signs the user in (the backend returns tokens), so it is an auth route, not proxied. */
async function verifyEmail(request: NextRequest, ctx: RequestContext): Promise<NextResponse> {
  if (!VERIFY_EMAIL_APPS.includes(ctx.config.app)) return notFound(ctx);
  const body = await parseBody(request, verifyEmailBodySchema, ctx);
  if (!body.ok) return body.response;
  const { data } = await unwrap(
    backendClient(ctx).POST('/api/v1/auth/email/verify', {
      body: { email: body.value.email, otp: body.value.otp },
    }),
  );
  return startSession(request, bodyTokens(data), 'EMAIL_VERIFIED', ctx);
}

async function refresh(request: NextRequest, ctx: RequestContext): Promise<NextResponse> {
  const { session, invalidCookie } = await readSession(request, ctx);
  if (session === null) return unauthenticated(ctx, invalidCookie);

  // Another tab (or a stray second call) already refreshed: never present a token that may have rotated.
  if (accessTokenRemainingMs(session, ctx.now) > ctx.config.refreshSkewSeconds * 1000) {
    return okResponse({ accessTokenExpiresAt: session.accessTokenExpiresAt }, ctx.correlationId);
  }

  let tokens: BodyAuthTokens;
  try {
    const { data } = await unwrap(
      backendClient(ctx).POST('/api/v1/auth/refresh', { body: { refreshToken: session.refreshToken } }),
    );
    tokens = bodyTokens(data);
  } catch (error) {
    if (!isApiError(error, 'INVALID_REFRESH_TOKEN')) throw error;
    ctx.log.info('REFRESH_FAILED', { userId: session.user.id });
    const response = apiErrorResponse(error, ctx.correlationId);
    clearSessionCookies(response, ctx.cookieOptions);
    return response;
  }

  if (tokens.user.role !== APP_ROLES[ctx.config.app]) {
    // Not expected (a user's role never changes); end the session rather than keep a mismatched one.
    await revoke(tokens.refreshToken, ctx);
    return unauthenticated(ctx, true);
  }
  return sessionResponse(
    okResponse({ accessTokenExpiresAt: tokens.accessTokenExpiresAt }, ctx.correlationId),
    tokens,
    ctx,
  );
}

async function logout(request: NextRequest, ctx: RequestContext): Promise<NextResponse> {
  const { session } = await readSession(request, ctx);
  if (session !== null) {
    await revoke(session.refreshToken, ctx);
    ctx.log.info('LOGOUT', { userId: session.user.id });
  }
  const response = noContentResponse(ctx.correlationId);
  clearSessionCookies(response, ctx.cookieOptions);
  return response;
}

const inviteBodySchema = z.strictObject({ token: z.string(), password: z.string() });

/** Roles that are invited (spec 03 / 04); their apps are the only places they may sign in. */
const INVITED_ROLES: readonly string[] = ['admin', 'delivery_agent'];

/**
 * Invite acceptance on the storefront's neutral landing page (architecture §5.7, spec 01 SF-20): the backend
 * sets the password and returns a session, which is revoked at once. No cookie is ever written here; the
 * invitee signs in to their own app. Answers only the role and email, so the page can send them there.
 */
async function acceptInvite(request: NextRequest, ctx: RequestContext): Promise<NextResponse> {
  if (ctx.config.app !== 'storefront') return notFound(ctx);
  const body = await parseBody(request, inviteBodySchema, ctx);
  if (!body.ok) return body.response;
  const { data } = await unwrap(
    backendClient(ctx).POST('/api/v1/auth/invite/accept', {
      body: { token: body.value.token, password: body.value.password },
    }),
  );
  const tokens = bodyTokens(data);
  await revoke(tokens.refreshToken, ctx);
  if (!INVITED_ROLES.includes(tokens.user.role)) {
    // Not expected (only admins and agents are invited); the session is already gone.
    ctx.log.warn('INVITE_UNEXPECTED_ROLE', { userId: tokens.user.id, role: tokens.user.role });
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected account type', ctx.correlationId);
  }
  ctx.log.info('INVITE_ACCEPTED', { userId: tokens.user.id, role: tokens.user.role });
  return okResponse({ role: tokens.user.role, email: tokens.user.email }, ctx.correlationId);
}

const passwordChangeBodySchema = z.strictObject({ currentPassword: z.string(), newPassword: z.string() });

/**
 * Change password in any app (spec 01 SF-19 and the other apps' security screens). The BFF adds the session's
 * refresh token, which the backend keeps alive while revoking every other session of the user (spec 03
 * §4.9b), so the cookie stays as it is. An expired access token is answered with 401 UNAUTHENTICATED without a
 * backend call (the browser refreshes and retries); INVALID_REFRESH_TOKEN ends the session here too.
 */
async function changePassword(request: NextRequest, ctx: RequestContext): Promise<NextResponse> {
  const { session, invalidCookie } = await readSession(request, ctx);
  if (session === null || accessTokenRemainingMs(session, ctx.now) <= 0)
    return unauthenticated(ctx, invalidCookie);
  const body = await parseBody(request, passwordChangeBodySchema, ctx);
  if (!body.ok) return body.response;
  try {
    await unwrap(
      backendClient(ctx, session.accessToken).POST('/api/v1/auth/password/change', {
        body: {
          currentPassword: body.value.currentPassword,
          newPassword: body.value.newPassword,
          refreshToken: session.refreshToken,
        },
      }),
    );
  } catch (error) {
    if (!isApiError(error, 'INVALID_REFRESH_TOKEN')) throw error;
    const response = apiErrorResponse(error, ctx.correlationId);
    clearSessionCookies(response, ctx.cookieOptions);
    return response;
  }
  ctx.log.info('PASSWORD_CHANGED', { userId: session.user.id });
  return noContentResponse(ctx.correlationId);
}

const AUTH_ACTIONS = {
  login,
  'verify-email': verifyEmail,
  invite: acceptInvite,
  'password-change': changePassword,
  refresh,
  logout,
} as const satisfies Record<string, (request: NextRequest, ctx: RequestContext) => Promise<NextResponse>>;
export type AuthAction = keyof typeof AUTH_ACTIONS;

function isAuthAction(action: string): action is AuthAction {
  return Object.hasOwn(AUTH_ACTIONS, action);
}

function notFound(ctx: RequestContext): NextResponse {
  return errorResponse(404, 'ROUTE_NOT_FOUND', 'Route not found', ctx.correlationId);
}

function csrfRejected(ctx: RequestContext, reason: string, route: string): NextResponse {
  ctx.log.warn('CSRF_REJECTED', { reason, route });
  return errorResponse(403, 'CSRF_REJECTED', 'Request rejected', ctx.correlationId);
}

function unexpected(error: unknown, ctx: RequestContext): NextResponse {
  if (error instanceof ApiError) return apiErrorResponse(error, ctx.correlationId);
  if (error instanceof Error && error.name === 'AbortError') {
    // The browser went away mid-request; nobody reads this answer.
    ctx.log.debug('Request aborted by the client');
    return errorResponse(500, 'INTERNAL_ERROR', 'Request aborted', ctx.correlationId);
  }
  ctx.log.error('Unexpected BFF error', { error });
  return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected error', ctx.correlationId);
}

export interface AuthRouteContext {
  params: Promise<{ action: string }>;
}

/** `app/api/auth/[action]/route.ts`: `export const POST = createAuthRouteHandler(authConfig)`. */
export function createAuthRouteHandler(getConfig: () => AuthAppConfig) {
  return async function POST(request: NextRequest, context: AuthRouteContext): Promise<Response> {
    const ctx = contextFor(request, getConfig());
    const { action } = await context.params;
    const csrf = checkCsrf(request, ctx.config.appOrigin);
    if (!csrf.ok)
      return csrfRejected(ctx, csrf.reason, `POST /api/auth/${isAuthAction(action) ? action : '?'}`);
    if (!isAuthAction(action)) return notFound(ctx);
    try {
      return await AUTH_ACTIONS[action](request, ctx);
    } catch (error) {
      return unexpected(error, ctx);
    }
  };
}

/** Request headers passed to the backend (design 01 §4.2 step 6). Nothing else: no cookies, no client auth. */
const FORWARDED_REQUEST_HEADERS = ['Content-Type', 'Accept', HEADER.IDEMPOTENCY_KEY] as const;
/** Response headers passed back to the browser (step 8). */
const FORWARDED_RESPONSE_HEADERS = [
  'Content-Type',
  'Retry-After',
  HEADER.CORRELATION_ID,
  'Idempotent-Replayed',
] as const;

/**
 * `app/api/bff/[...path]/route.ts`: `export const { GET, POST, PATCH, PUT, DELETE } = createBffRouteHandler(…)`.
 * Pipeline of design 01 §4.2: CSRF → allow-list → body → session → forward → pass the answer back. Other
 * methods never reach it: Next.js answers 405 for methods the route doesn't export.
 */
export function createBffRouteHandler(getConfig: () => AuthAppConfig) {
  let matcher: ReturnType<typeof createAllowListMatcher> | undefined;

  async function handle(request: NextRequest): Promise<Response> {
    const config = getConfig();
    const ctx = contextFor(request, config);
    matcher ??= createAllowListMatcher(config.app);
    const started = performance.now();
    const method = request.method.toUpperCase();
    const url = new URL(request.url);
    const path = url.pathname.startsWith(`${BFF_ROUTE_PREFIX}/`)
      ? url.pathname.slice(BFF_ROUTE_PREFIX.length)
      : '';
    let route = 'unmatched';
    let userId: string | undefined;

    const finish = (response: Response): Response => {
      ctx.log.info('BFF request', {
        method,
        route,
        status: response.status,
        durationMs: Math.round(performance.now() - started),
        ...(userId === undefined ? {} : { userId }),
      });
      return response;
    };

    if (method !== 'GET') {
      const csrf = checkCsrf(request, config.appOrigin);
      if (!csrf.ok) return finish(csrfRejected(ctx, csrf.reason, method));
    }
    const operation = matcher.match(method, path);
    if (operation === null) return finish(notFound(ctx));
    route = `${operation.method} ${operation.path}`;

    let body: string | undefined;
    if (method !== 'GET') {
      const read = await readJsonBody(request, config.maxBodyBytes, ctx.correlationId);
      if (!read.ok) return finish(read.response);
      if (read.text !== '') body = read.text;
    }

    const headers = new Headers();
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    headers.set(HEADER.CORRELATION_ID, ctx.correlationId);

    if (operation.auth === 'bearer') {
      const { session, invalidCookie } = await readSession(request, ctx);
      // An expired access token is answered here, without a backend call, so the browser refreshes first.
      if (session === null || accessTokenRemainingMs(session, ctx.now) <= 0) {
        return finish(unauthenticated(ctx, invalidCookie));
      }
      userId = session.user.id;
      headers.set(HEADER.AUTHORIZATION, `Bearer ${session.accessToken}`);
    }

    let upstream: Response;
    try {
      upstream = await forwardToBackend({
        baseUrl: config.apiBaseUrl,
        method,
        path,
        search: url.search,
        headers,
        timeoutMs: config.upstreamTimeoutMs,
        signal: request.signal,
        ...(body === undefined ? {} : { body }),
        ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
      });
    } catch (error) {
      if (error instanceof ApiError) ctx.log.warn('Backend unavailable', { code: error.code, route });
      return finish(unexpected(error, ctx));
    }

    const responseHeaders = new Headers({ 'Cache-Control': NO_STORE });
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value !== null) responseHeaders.set(name, value);
    }
    if (!responseHeaders.has(HEADER.CORRELATION_ID))
      responseHeaders.set(HEADER.CORRELATION_ID, ctx.correlationId);
    const passBody = upstream.status !== 204 && upstream.status !== 304;
    return finish(
      new Response(passBody ? upstream.body : null, { status: upstream.status, headers: responseHeaders }),
    );
  }

  return { GET: handle, POST: handle, PATCH: handle, PUT: handle, DELETE: handle };
}
