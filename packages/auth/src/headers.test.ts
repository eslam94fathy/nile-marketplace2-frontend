import { describe, expect, it } from 'vitest';
import {
  contentSecurityPolicy,
  createNonce,
  NO_EXTRA_ORIGINS,
  staticSecurityHeaders,
  webSocketOrigin,
} from './headers';

describe('security headers (design 01 §10)', () => {
  it('production policy: nonce-only scripts, inline styles allowed, nothing from elsewhere, no framing', () => {
    expect(contentSecurityPolicy({ nonce: 'abc', development: false, origins: NO_EXTRA_ORIGINS })).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'nonce-abc' 'strict-dynamic'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "worker-src 'self'",
        "manifest-src 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
      ].join('; '),
    );
  });

  it('development relaxes only what next dev needs', () => {
    const policy = contentSecurityPolicy({ nonce: 'abc', development: true, origins: NO_EXTRA_ORIGINS });
    expect(policy).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic' 'unsafe-eval'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('Release 2 hosts: media images, presigned uploads with blob: previews, the realtime socket (design 01 §15.7)', () => {
    const policy = contentSecurityPolicy({
      nonce: 'abc',
      development: false,
      origins: {
        images: ['https://media.nile.test', 'https://bucket.storage.test'],
        uploads: ['https://bucket.storage.test'],
        realtime: 'https://api.nile.test',
      },
    });
    expect(policy).toContain(
      "img-src 'self' data: blob: https://media.nile.test https://bucket.storage.test;",
    );
    expect(policy).toContain("connect-src 'self' https://bucket.storage.test wss://api.nile.test;");
    expect(policy).toContain("worker-src 'self'; manifest-src 'self'");
    // Scripts never gain a host: only the nonce loads code.
    expect(policy).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic';");
  });

  it('an app that uploads nothing gets no blob: and no upload host; one host is listed once', () => {
    const policy = contentSecurityPolicy({
      nonce: 'abc',
      development: false,
      origins: {
        images: ['http://localhost:9100', 'http://localhost:9100'],
        uploads: [],
        realtime: 'http://localhost:3001',
      },
    });
    expect(policy).toContain("img-src 'self' data: http://localhost:9100;");
    expect(policy).toContain("connect-src 'self' ws://localhost:3001;");
  });

  it('webSocketOrigin keeps host and port, swaps the scheme', () => {
    expect(webSocketOrigin('https://api.nile.test')).toBe('wss://api.nile.test');
    expect(webSocketOrigin('http://localhost:3001')).toBe('ws://localhost:3001');
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
