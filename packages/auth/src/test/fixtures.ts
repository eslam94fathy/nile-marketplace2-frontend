import type { BffApp } from '@nile/api';
import { createLogger } from '@nile/logger';
import { AUTH_FIXTURE_NOW, authTokensFactory, TEST_API_ORIGIN } from '@nile/test-utils';
import { NextRequest } from 'next/server';
import { APP_ROLES, type AuthAppConfig } from '../config';
import { cookieNames } from '../cookies';
import { sealSession, sessionFromTokens, type AuthTokens, type SessionKeyRing } from '../session';

export const APP_ORIGIN = 'http://app.test';
export const NOW = AUTH_FIXTURE_NOW;

const key = (byte: number) => Buffer.alloc(32, byte).toString('base64');
export const KEY_RING: SessionKeyRing = { keys: { k1: key(1), k2: key(2) }, activeKeyId: 'k1' };

export interface TestConfig {
  config: AuthAppConfig;
  /** Every log line written during the test, raw, to assert that no secret was logged. */
  logs: string[];
}

export function testConfig(app: BffApp = 'storefront', overrides: Partial<AuthAppConfig> = {}): TestConfig {
  const logs: string[] = [];
  const config: AuthAppConfig = {
    app,
    appOrigin: APP_ORIGIN,
    apiBaseUrl: TEST_API_ORIGIN,
    sessionKeys: KEY_RING,
    cookieSecure: true,
    refreshSkewSeconds: 60,
    upstreamTimeoutMs: 1000,
    maxBodyBytes: 1024,
    logger: createLogger({ app, level: 'debug', env: 'test', write: (line) => logs.push(line) }),
    now: () => NOW,
    ...overrides,
  };
  return { config, logs };
}

/** Tokens for the role `app` accepts. */
export function tokensFor(app: BffApp, overrides: Partial<AuthTokens> = {}): AuthTokens {
  const tokens = authTokensFactory(overrides);
  return { ...tokens, user: { ...tokens.user, role: APP_ROLES[app] } };
}

export async function sessionCookie(
  app: BffApp,
  tokens: AuthTokens,
  ring: SessionKeyRing = KEY_RING,
): Promise<string> {
  const sealed = await sealSession(sessionFromTokens(tokens, NOW), ring);
  return `${cookieNames(app, true).session}=${sealed}`;
}

export interface RequestInit {
  method?: string;
  body?: string;
  cookie?: string;
  headers?: Record<string, string>;
  /** Drop the same-origin headers a browser on our page would send. */
  crossSite?: boolean;
}

export function makeRequest(path: string, init: RequestInit = {}): NextRequest {
  const headers = new Headers(init.headers);
  if (!init.crossSite) {
    if (!headers.has('Origin')) headers.set('Origin', APP_ORIGIN);
    if (!headers.has('X-Nile-Client')) headers.set('X-Nile-Client', '1');
  }
  if (init.body !== undefined && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  if (init.cookie !== undefined) headers.set('Cookie', init.cookie);
  return new NextRequest(`${APP_ORIGIN}${path}`, {
    method: init.method ?? 'POST',
    headers,
    ...(init.body === undefined ? {} : { body: init.body }),
  });
}

export interface SetCookie {
  name: string;
  value: string;
  attributes: string[];
}

export function setCookies(response: Response): SetCookie[] {
  return response.headers.getSetCookie().map((line) => {
    const [pair = '', ...attributes] = line.split(';').map((part) => part.trim());
    const separator = pair.indexOf('=');
    return { name: pair.slice(0, separator), value: pair.slice(separator + 1), attributes };
  });
}
