import { CompactEncrypt } from 'jose';
import { describe, expect, it } from 'vitest';
import { cookieNames, sessionMaxAge } from './cookies';
import {
  accessTokenRemainingMs,
  sealSession,
  sessionFromTokens,
  unsealSession,
  type SessionV1,
} from './session';
import { KEY_RING, NOW, tokensFor } from './test/fixtures';

const session = (): SessionV1 => sessionFromTokens(tokensFor('storefront'), NOW);

async function sealRaw(
  payload: unknown,
  kid = 'k1',
  enc: 'A256GCM' | 'A128GCM' = 'A256GCM',
): Promise<string> {
  const keyLength = enc === 'A256GCM' ? 32 : 16;
  return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: 'dir', enc, kid })
    .encrypt(Buffer.alloc(keyLength, 1));
}

describe('session cookie encryption', () => {
  it('round-trips a session', async () => {
    const original = session();
    const sealed = await sealSession(original, KEY_RING);
    expect(await unsealSession(sealed, KEY_RING, NOW)).toEqual(original);
  });

  it('is encrypted: no token or email is readable in the cookie value', async () => {
    const original = session();
    const sealed = await sealSession(original, KEY_RING);
    const decoded = sealed
      .split('.')
      .map((part) => Buffer.from(part, 'base64url').toString('latin1'))
      .join('.');
    for (const secret of [original.accessToken, original.refreshToken, original.user.email]) {
      expect(sealed).not.toContain(secret);
      expect(decoded).not.toContain(secret);
    }
  });

  it('names the active key in the header', async () => {
    const sealed = await sealSession(session(), KEY_RING);
    const header = JSON.parse(Buffer.from(sealed.split('.')[0] ?? '', 'base64url').toString()) as Record<
      string,
      unknown
    >;
    expect(header).toEqual({ alg: 'dir', enc: 'A256GCM', kid: 'k1' });
  });

  it('rejects a tampered cookie', async () => {
    const sealed = await sealSession(session(), KEY_RING);
    const parts = sealed.split('.');
    const ciphertext = Buffer.from(parts[3] ?? '', 'base64url');
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 0xff;
    parts[3] = ciphertext.toString('base64url');
    expect(await unsealSession(parts.join('.'), KEY_RING, NOW)).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await unsealSession('not-a-jwe', KEY_RING, NOW)).toBeNull();
    expect(await unsealSession('', KEY_RING, NOW)).toBeNull();
  });

  it('rejects a cookie encrypted with a key that is not in the ring', async () => {
    const foreign = { keys: { k1: Buffer.alloc(32, 9).toString('base64') }, activeKeyId: 'k1' };
    const sealed = await sealSession(session(), foreign);
    expect(await unsealSession(sealed, KEY_RING, NOW)).toBeNull();
  });

  it('rejects an unknown kid and a different algorithm', async () => {
    expect(await unsealSession(await sealRaw(session(), 'k9'), KEY_RING, NOW)).toBeNull();
    expect(await unsealSession(await sealRaw(session(), 'k1', 'A128GCM'), KEY_RING, NOW)).toBeNull();
  });

  it('rejects a well-encrypted payload of the wrong shape', async () => {
    expect(await unsealSession(await sealRaw({ ...session(), v: 2 }), KEY_RING, NOW)).toBeNull();
    expect(await unsealSession(await sealRaw({ ...session(), extra: 1 }), KEY_RING, NOW)).toBeNull();
    expect(await unsealSession(await sealRaw({ user: {} }), KEY_RING, NOW)).toBeNull();
  });

  it('rejects a session whose refresh token has expired', async () => {
    const sealed = await sealSession(session(), KEY_RING);
    expect(await unsealSession(sealed, KEY_RING, new Date('2026-11-13T08:00:00.000Z'))).toBeNull();
  });

  describe('key rotation', () => {
    it('reads cookies written with an older key that is still in the ring', async () => {
      const old = await sealSession(session(), { ...KEY_RING, activeKeyId: 'k2' });
      expect(await unsealSession(old, KEY_RING, NOW)).not.toBeNull();
    });

    it('writes new cookies with the active key', async () => {
      const rotated = { ...KEY_RING, activeKeyId: 'k2' };
      const sealed = await sealSession(session(), rotated);
      expect(
        await unsealSession(sealed, { keys: { k2: KEY_RING.keys.k2 ?? '' }, activeKeyId: 'k2' }, NOW),
      ).not.toBeNull();
    });

    it('drops cookies of a key removed from the ring', async () => {
      const sealed = await sealSession(session(), KEY_RING);
      expect(
        await unsealSession(sealed, { keys: { k2: KEY_RING.keys.k2 ?? '' }, activeKeyId: 'k2' }, NOW),
      ).toBeNull();
    });

    it('refuses to write with an active key id that has no key', async () => {
      await expect(sealSession(session(), { ...KEY_RING, activeKeyId: 'nope' })).rejects.toThrow();
    });
  });
});

describe('session helpers', () => {
  it('keeps only id, email, role and status of the user', () => {
    const tokens = tokensFor('storefront');
    const withExtra = { ...tokens, user: { ...tokens.user, extra: 'x' } };
    expect(Object.keys(sessionFromTokens(withExtra, NOW).user).sort()).toEqual([
      'email',
      'id',
      'role',
      'status',
    ]);
  });

  it('computes the remaining access-token time and the cookie lifetime', () => {
    expect(accessTokenRemainingMs(session(), NOW)).toBe(15 * 60 * 1000);
    expect(sessionMaxAge(session(), NOW)).toBe(30 * 24 * 60 * 60);
  });

  it('uses __Host- names only with Secure cookies', () => {
    expect(cookieNames('seller', true)).toEqual({
      session: '__Host-nile_seller_session',
      sessionVersion: '__Host-nile_seller_sv',
    });
    expect(cookieNames('seller', false)).toEqual({
      session: 'nile_seller_session',
      sessionVersion: 'nile_seller_sv',
    });
  });
});
