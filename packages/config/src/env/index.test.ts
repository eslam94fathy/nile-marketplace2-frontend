import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import {
  checkEnvConsistency,
  EnvError,
  parseEnv,
  publicEnvSchema,
  serverEnvSchema,
  storefrontPublicEnvExtension,
  type PublicEnv,
  type ServerEnv,
} from './index';

const KEY_A = btoa('a'.repeat(32));
const KEY_B = btoa('b'.repeat(32));

const validServer = {
  NODE_ENV: 'development',
  APP_ORIGIN: 'http://localhost:4100',
  NILE_API_BASE_URL: 'http://localhost:3100',
  SESSION_ENCRYPTION_KEYS: JSON.stringify({ k1: KEY_A, k2: KEY_B }),
  SESSION_ACTIVE_KEY_ID: 'k2',
  SESSION_COOKIE_SECURE: 'false',
  REFRESH_SKEW_SECONDS: '60',
  BFF_UPSTREAM_TIMEOUT_MS: '15000',
  BFF_MAX_BODY_KB: '64',
  LOG_LEVEL: 'debug',
} satisfies Record<keyof ServerEnv, string>;

const validPublic = {
  NEXT_PUBLIC_APP_NAME: 'storefront',
  NEXT_PUBLIC_STOREFRONT_URL: 'http://localhost:4100',
  NEXT_PUBLIC_SELLER_URL: 'http://localhost:4101',
  NEXT_PUBLIC_ADMIN_URL: 'http://localhost:4102',
  NEXT_PUBLIC_AGENT_URL: 'http://localhost:4103',
  NEXT_PUBLIC_REFRESH_SKEW_SECONDS: '60',
} satisfies Record<keyof PublicEnv, string>;

function parseServer(overrides: Record<string, string | undefined> = {}): ServerEnv {
  return parseEnv(serverEnvSchema, { ...validServer, ...overrides }, 'server');
}

function errorOf(run: () => unknown): EnvError {
  try {
    run();
  } catch (error) {
    if (error instanceof EnvError) return error;
    throw error;
  }
  throw new Error('expected an EnvError');
}

describe('serverEnvSchema', () => {
  it('parses a valid environment into typed values', () => {
    const env = parseServer();
    expect(env.REFRESH_SKEW_SECONDS).toBe(60);
    expect(env.SESSION_COOKIE_SECURE).toBe(false);
    expect(env.SESSION_ENCRYPTION_KEYS).toEqual({ k1: KEY_A, k2: KEY_B });
  });

  it('ignores unrelated variables', () => {
    expect(() => parseServer({ PATH: '/usr/bin', HOME: '/home/x' })).not.toThrow();
  });

  it.each(Object.keys(validServer))('reports %s as missing when absent', (key) => {
    const error = errorOf(() => parseServer({ [key]: undefined }));
    expect(error.problems).toContainEqual({ key, reason: 'is missing' });
  });

  it('treats an empty value as missing (no silent defaults)', () => {
    const error = errorOf(() => parseServer({ REFRESH_SKEW_SECONDS: '' }));
    expect(error.problems).toContainEqual({ key: 'REFRESH_SKEW_SECONDS', reason: 'is missing' });
  });

  it('reports every problem at once', () => {
    const error = errorOf(() =>
      parseServer({ APP_ORIGIN: undefined, LOG_LEVEL: 'loud', BFF_MAX_BODY_KB: '0' }),
    );
    expect(error.keys).toEqual(expect.arrayContaining(['APP_ORIGIN', 'LOG_LEVEL', 'BFF_MAX_BODY_KB']));
  });

  it.each([
    ['APP_ORIGIN', 'http://localhost:4100/'],
    ['APP_ORIGIN', 'http://localhost:4100/app'],
    ['APP_ORIGIN', 'ftp://localhost'],
    ['APP_ORIGIN', 'localhost:4100'],
    ['NILE_API_BASE_URL', 'http://localhost:3100/api/v1'],
    ['NODE_ENV', 'staging'],
    ['SESSION_COOKIE_SECURE', 'yes'],
    ['REFRESH_SKEW_SECONDS', '60s'],
    ['REFRESH_SKEW_SECONDS', '-1'],
    ['REFRESH_SKEW_SECONDS', '601'],
    ['BFF_UPSTREAM_TIMEOUT_MS', '999'],
    ['BFF_UPSTREAM_TIMEOUT_MS', '1.5'],
    ['LOG_LEVEL', 'trace'],
    ['SESSION_ACTIVE_KEY_ID', 'bad key id!'],
  ])('rejects %s=%s', (key, value) => {
    expect(errorOf(() => parseServer({ [key]: value })).keys).toContain(key);
  });

  it.each([
    ['not JSON', 'k1:abc'],
    ['an array', JSON.stringify([KEY_A])],
    ['an empty object', '{}'],
    ['a bad key id', JSON.stringify({ 'bad id': KEY_A })],
    ['a 16-byte key', JSON.stringify({ k1: btoa('a'.repeat(16)) })],
    ['a non-base64 key', JSON.stringify({ k1: '!'.repeat(44) })],
    ['a non-string key', JSON.stringify({ k1: 42 })],
  ])('rejects SESSION_ENCRYPTION_KEYS that is %s', (_label, value) => {
    const error = errorOf(() => parseServer({ SESSION_ENCRYPTION_KEYS: value, SESSION_ACTIVE_KEY_ID: 'k1' }));
    expect(error.keys).toContain('SESSION_ENCRYPTION_KEYS');
  });

  it('requires the active key id to exist in the key ring', () => {
    const error = errorOf(() => parseServer({ SESSION_ACTIVE_KEY_ID: 'k9' }));
    expect(error.problems).toContainEqual({
      key: 'SESSION_ACTIVE_KEY_ID',
      reason: 'must be one of the key ids in SESSION_ENCRYPTION_KEYS',
    });
  });

  describe('in production', () => {
    const production = {
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://shop.example.com',
      SESSION_COOKIE_SECURE: 'true',
    };

    it('accepts secure cookies on an https origin', () => {
      expect(() => parseServer(production)).not.toThrow();
    });

    it('rejects insecure cookies', () => {
      const error = errorOf(() => parseServer({ ...production, SESSION_COOKIE_SECURE: 'false' }));
      expect(error.problems).toContainEqual({
        key: 'SESSION_COOKIE_SECURE',
        reason: 'must be "true" in production',
      });
    });

    it('allows a localhost http origin with secure cookies (production build under E2E)', () => {
      expect(() => parseServer({ ...production, APP_ORIGIN: 'http://localhost:4100' })).not.toThrow();
    });
  });

  it('never puts values in the error message', () => {
    const secretLooking = btoa('s'.repeat(16)); // wrong length, so it is rejected
    const error = errorOf(() =>
      parseServer({
        SESSION_ENCRYPTION_KEYS: JSON.stringify({ k1: secretLooking }),
        SESSION_ACTIVE_KEY_ID: 'k1',
        NILE_API_BASE_URL: 'http://internal-host.example:1234/secret-path',
      }),
    );
    expect(error.message).not.toContain(secretLooking);
    expect(error.message).not.toContain('internal-host');
    expect(error.message).toContain('SESSION_ENCRYPTION_KEYS');
  });
});

describe('publicEnvSchema', () => {
  it('parses the shared public keys', () => {
    const env = parseEnv(publicEnvSchema('storefront'), validPublic, 'public');
    expect(env.NEXT_PUBLIC_REFRESH_SKEW_SECONDS).toBe(60);
  });

  it('rejects a build configured for another app', () => {
    const error = errorOf(() => parseEnv(publicEnvSchema('admin'), validPublic, 'public'));
    expect(error.problems).toContainEqual({
      key: 'NEXT_PUBLIC_APP_NAME',
      reason: 'must be "admin" for this app',
    });
  });

  it('adds the storefront payment window key', () => {
    const schema = publicEnvSchema('storefront').extend(storefrontPublicEnvExtension);
    expect(errorOf(() => parseEnv(schema, validPublic, 'public')).keys).toEqual([
      'NEXT_PUBLIC_KASHIER_PAYMENT_WINDOW_MINUTES',
    ]);
    const env = parseEnv(
      schema,
      { ...validPublic, NEXT_PUBLIC_KASHIER_PAYMENT_WINDOW_MINUTES: '15' },
      'public',
    );
    expect(env.NEXT_PUBLIC_KASHIER_PAYMENT_WINDOW_MINUTES).toBe(15);
  });
});

describe('checkEnvConsistency', () => {
  const server = parseServer();
  const publicEnv = parseEnv(publicEnvSchema('storefront'), validPublic, 'public');

  it('accepts matching origin and skews', () => {
    expect(() => {
      checkEnvConsistency('storefront', server, publicEnv);
    }).not.toThrow();
  });

  it("requires APP_ORIGIN to equal the app's own public URL", () => {
    const error = errorOf(() => {
      checkEnvConsistency('seller', server, publicEnv);
    });
    expect(error.problems).toContainEqual({ key: 'APP_ORIGIN', reason: 'must equal NEXT_PUBLIC_SELLER_URL' });
  });

  it('rejects a browser refresh skew larger than the server skew (refresh loop)', () => {
    const error = errorOf(() => {
      checkEnvConsistency('storefront', server, { ...publicEnv, NEXT_PUBLIC_REFRESH_SKEW_SECONDS: 61 });
    });
    expect(error.keys).toEqual(['NEXT_PUBLIC_REFRESH_SKEW_SECONDS']);
  });
});

describe('parseEnv', () => {
  it('returns the parsed value for any schema', () => {
    expect(parseEnv(z.object({ A: z.string() }), { A: 'x' }, 'test')).toEqual({ A: 'x' });
  });
});
