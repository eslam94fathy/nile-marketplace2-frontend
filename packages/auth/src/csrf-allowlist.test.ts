import { BFF_ALLOW_LISTS, BFF_APPS } from '@nile/api';
import { describe, expect, it } from 'vitest';
import { checkCsrf } from './csrf';
import { compileTemplate, createAllowListMatcher } from './proxy-allowlist';

const ORIGIN = 'http://app.test';
const ID = '6f1c1f8e-2b7a-4c2e-9d55-0d2a1b3c4d5e';

const request = (headers: Record<string, string>) =>
  new Request(`${ORIGIN}/api/bff/cart`, { method: 'POST', headers });

describe('checkCsrf', () => {
  it('accepts our origin with the client header', () => {
    expect(checkCsrf(request({ Origin: ORIGIN, 'X-Nile-Client': '1' }), ORIGIN)).toEqual({ ok: true });
  });

  it.each([
    [{ 'X-Nile-Client': '1' }, 'origin-missing'],
    [{ Origin: 'http://evil.test', 'X-Nile-Client': '1' }, 'origin-mismatch'],
    [{ Origin: 'http://app.test.evil.test', 'X-Nile-Client': '1' }, 'origin-mismatch'],
    [{ Origin: 'null', 'X-Nile-Client': '1' }, 'origin-mismatch'],
    [{ Origin: ORIGIN }, 'client-header'],
    [{ Origin: ORIGIN, 'X-Nile-Client': 'yes' }, 'client-header'],
  ])('rejects %o (%s)', (headers, reason) => {
    expect(checkCsrf(request(headers), ORIGIN)).toEqual({ ok: false, reason });
  });
});

/** A concrete path for a template: ids filled with a UUID, idOrSlug with a slug. */
const concrete = (template: string) => template.replace('{idOrSlug}', 'red-shirt').replace(/\{\w+\}/g, ID);

describe('allow-list matcher', () => {
  it.each(BFF_APPS)('%s: matches every allowed operation and only with its own method', (app) => {
    const matcher = createAllowListMatcher(app);
    for (const operation of BFF_ALLOW_LISTS[app]) {
      const path = concrete(operation.path);
      expect(matcher.match(operation.method, path), `${operation.method} ${path}`).toEqual(
        // Another entry may share the path with this method only if it is this very operation.
        operation,
      );
    }
  });

  it("does not let one app reach another app's operations (matrix)", () => {
    for (const app of BFF_APPS) {
      const matcher = createAllowListMatcher(app);
      const own = new Set(BFF_ALLOW_LISTS[app].map((o) => `${o.method} ${o.path}`));
      for (const other of BFF_APPS) {
        for (const operation of BFF_ALLOW_LISTS[other]) {
          const allowed = own.has(`${operation.method} ${operation.path}`);
          const match = matcher.match(operation.method, concrete(operation.path));
          expect(match !== null, `${app} → ${operation.method} ${operation.path}`).toBe(allowed);
        }
      }
    }
  });

  it.each([
    ['GET', '/admin/sellers'],
    ['GET', '/auth/login'],
    ['POST', '/auth/login'],
    ['POST', '/auth/refresh'],
    ['POST', '/webhooks/kashier'],
    ['PUT', '/cart'],
    ['GET', '/cart/'],
    ['GET', '//cart'],
    ['GET', '/CART'],
    ['GET', `/orders/not-a-uuid`],
    ['GET', `/orders/${ID}/../../admin/sellers`],
    ['GET', `/orders/${ID}%2F..%2Fadmin`],
    ['GET', `/orders/${ID}/extra`],
    ['GET', '/products/Red_Shirt'],
    ['GET', '/products/-red'],
    ['GET', '/products/red%2Fshirt'],
    ['GET', ''],
    ['GET', `/orders/${'a'.repeat(600)}`],
  ])('storefront refuses %s %s', (method, path) => {
    expect(createAllowListMatcher('storefront').match(method, path)).toBeNull();
  });

  it('accepts a product UUID and a slug, and lower-case methods', () => {
    const matcher = createAllowListMatcher('storefront');
    expect(matcher.match('GET', `/products/${ID}`)?.path).toBe('/products/{idOrSlug}');
    expect(matcher.match('GET', '/products/red-shirt-2')?.path).toBe('/products/{idOrSlug}');
    expect(matcher.match('get', '/cart')?.path).toBe('/cart');
  });

  it('escapes literal segments', () => {
    expect(compileTemplate('/a.b/{id}').test(`/axb/${ID}`)).toBe(false);
    expect(compileTemplate('/a.b/{id}').test(`/a.b/${ID}`)).toBe(true);
  });
});
