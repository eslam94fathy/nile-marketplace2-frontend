import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, createNonce, staticSecurityHeaders } from './headers';

describe('security headers (design 01 §10)', () => {
  it('production policy: nonce-only scripts, inline styles allowed, nothing from elsewhere, no framing', () => {
    expect(contentSecurityPolicy({ nonce: 'abc', development: false })).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'nonce-abc' 'strict-dynamic'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
      ].join('; '),
    );
  });

  it('development relaxes only what next dev needs', () => {
    const policy = contentSecurityPolicy({ nonce: 'abc', development: true });
    expect(policy).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic' 'unsafe-eval'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('nonces are 128 random bits, never repeated', () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createNonce()));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(atob(nonce)).toHaveLength(16);
  });

  it('static headers; HSTS only in production', () => {
    const keys = (production: boolean) => staticSecurityHeaders({ production }).map((header) => header.key);
    expect(keys(false)).toEqual([
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Cross-Origin-Opener-Policy',
      'X-Frame-Options',
    ]);
    expect(staticSecurityHeaders({ production: true }).at(-1)).toEqual({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains',
    });
  });
});
