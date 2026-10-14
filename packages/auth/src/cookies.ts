import type { BffApp } from '@nile/api';
import type { NextResponse } from 'next/server';
import type { SessionV1 } from './session';

// Cookie names and attributes (design 01 §3.1). With SESSION_COOKIE_SECURE=false (local http only) the
// `__Host-` prefix is dropped, because browsers reject `__Host-` cookies without `Secure`.

export interface CookieNames {
  /** Encrypted session (httpOnly). */
  session: string;
  /** Access-token expiry in epoch ms, readable by the page's scripts (no secret), for the refresh coordinator. */
  sessionVersion: string;
}

export function cookieNames(app: BffApp, secure: boolean): CookieNames {
  const prefix = secure ? '__Host-' : '';
  return { session: `${prefix}nile_${app}_session`, sessionVersion: `${prefix}nile_${app}_sv` };
}

/** Seconds until the refresh token expires: the session can't outlive it. */
export function sessionMaxAge(session: SessionV1, now: Date): number {
  return Math.max(0, Math.floor((Date.parse(session.refreshTokenExpiresAt) - now.getTime()) / 1000));
}

interface WriteOptions {
  names: CookieNames;
  secure: boolean;
}

export function writeSessionCookies(
  response: NextResponse,
  sealed: string,
  session: SessionV1,
  now: Date,
  { names, secure }: WriteOptions,
): void {
  const maxAge = sessionMaxAge(session, now);
  const common = { secure, sameSite: 'lax', path: '/', maxAge } as const;
  response.cookies.set(names.session, sealed, { ...common, httpOnly: true });
  response.cookies.set(names.sessionVersion, String(Date.parse(session.accessTokenExpiresAt)), {
    ...common,
    httpOnly: false,
  });
}

export function clearSessionCookies(response: NextResponse, { names, secure }: WriteOptions): void {
  const common = { secure, sameSite: 'lax', path: '/', maxAge: 0 } as const;
  response.cookies.set(names.session, '', { ...common, httpOnly: true });
  response.cookies.set(names.sessionVersion, '', { ...common, httpOnly: false });
}
