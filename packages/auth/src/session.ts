import type { Schema } from '@nile/api';
import { CompactEncrypt, compactDecrypt, decodeProtectedHeader } from 'jose';
import { z } from 'zod';

// The session lives only in an encrypted, httpOnly cookie (design 01 §3.1): a compact JWE (`dir` +
// `A256GCM`) whose `kid` header names the key, so keys can be rotated without logging everyone out.

export type AuthTokens = Schema<'AuthTokensDto'>;
export type SessionUser = Schema<'AuthUserDto'>;
export type UserRole = SessionUser['role'];

const ALG = 'dir';
const ENC = 'A256GCM';

const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  role: z.enum(['customer', 'seller', 'admin', 'delivery_agent']),
  status: z.enum(['pending_email_verification', 'invited', 'active', 'suspended']),
}) satisfies z.ZodType<SessionUser>;

const isoDate = z.iso.datetime({ offset: true });

const sessionSchema = z.strictObject({
  v: z.literal(1),
  accessToken: z.string().min(1),
  accessTokenExpiresAt: isoDate,
  refreshToken: z.string().min(1),
  refreshTokenExpiresAt: isoDate,
  user: userSchema,
  issuedAt: isoDate,
});

/** Cookie payload, version 1 (design 01 §3.1). Never sent to the browser in readable form. */
export type SessionV1 = z.infer<typeof sessionSchema>;

/** Keys by id (`SESSION_ENCRYPTION_KEYS`) and the id used for new cookies (`SESSION_ACTIVE_KEY_ID`). */
export interface SessionKeyRing {
  keys: Readonly<Record<string, string>>;
  activeKeyId: string;
}

function keyBytes(ring: SessionKeyRing, kid: string): Uint8Array | null {
  if (!Object.hasOwn(ring.keys, kid)) return null;
  const encoded = ring.keys[kid];
  return encoded === undefined ? null : Uint8Array.from(Buffer.from(encoded, 'base64'));
}

export function sessionFromTokens(tokens: AuthTokens, now: Date): SessionV1 {
  return {
    v: 1,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    refreshToken: tokens.refreshToken,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    user: {
      id: tokens.user.id,
      email: tokens.user.email,
      role: tokens.user.role,
      status: tokens.user.status,
    },
    issuedAt: now.toISOString(),
  };
}

export async function sealSession(session: SessionV1, ring: SessionKeyRing): Promise<string> {
  const key = keyBytes(ring, ring.activeKeyId);
  if (key === null) throw new Error('The active session key id has no key');
  return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(session)))
    .setProtectedHeader({ alg: ALG, enc: ENC, kid: ring.activeKeyId })
    .encrypt(key);
}

/**
 * The session in `cookie`, or null for anything that isn't a valid cookie we wrote: unknown `kid`, wrong
 * algorithm, failed authentication (tampering), malformed payload, or a refresh token past its expiry.
 * Callers treat null as "signed out" and clear the cookie.
 */
export async function unsealSession(
  cookie: string,
  ring: SessionKeyRing,
  now: Date,
): Promise<SessionV1 | null> {
  try {
    const header = decodeProtectedHeader(cookie);
    if (header.alg !== ALG || header.enc !== ENC || typeof header.kid !== 'string') return null;
    const key = keyBytes(ring, header.kid);
    if (key === null) return null;
    const { plaintext } = await compactDecrypt(cookie, key, {
      keyManagementAlgorithms: [ALG],
      contentEncryptionAlgorithms: [ENC],
    });
    const parsed = sessionSchema.safeParse(JSON.parse(new TextDecoder().decode(plaintext)));
    if (!parsed.success) return null;
    if (Date.parse(parsed.data.refreshTokenExpiresAt) <= now.getTime()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** Milliseconds until the access token expires (negative once expired). */
export function accessTokenRemainingMs(session: SessionV1, now: Date): number {
  return Date.parse(session.accessTokenExpiresAt) - now.getTime();
}
