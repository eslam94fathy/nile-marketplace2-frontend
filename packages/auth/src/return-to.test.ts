import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './return-to';

describe('safeReturnTo', () => {
  it.each([
    ['/account/orders', '/account/orders'],
    ['/account/orders?status=placed&x=1', '/account/orders?status=placed&x=1'],
    ['/p/red-shirt#reviews', '/p/red-shirt#reviews'],
    ['/', '/'],
    ['/search?q=%2F%2Fevil.test', '/search?q=%2F%2Fevil.test'],
    ['/a/../account', '/account'],
  ])('accepts %s', (value, expected) => {
    expect(safeReturnTo(value)).toBe(expected);
  });

  it.each([
    'https://evil.test/account',
    'http:/evil.test',
    '//evil.test',
    '//evil.test/account',
    '/\\evil.test',
    '\\\\evil.test',
    '/%5Cevil.test'.replace('%5C', '\\'),
    'javascript:alert(1)',
    'data:text/html,x',
    'account/orders',
    ' /account',
    '/account\n/x',
    '/account\t',
    '',
    '/api/bff/me',
    '/api',
    `/${'a'.repeat(2100)}`,
  ])('refuses %j', (value) => {
    expect(safeReturnTo(value)).toBeNull();
  });

  it('refuses missing values', () => {
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(undefined)).toBeNull();
  });

  it('refuses excluded pages such as the sign-in page itself', () => {
    expect(safeReturnTo('/login?returnTo=/x', { exclude: ['/login'] })).toBeNull();
    expect(safeReturnTo('/login/help', { exclude: ['/login'] })).toBeNull();
    expect(safeReturnTo('/loginx', { exclude: ['/login'] })).toBe('/loginx');
  });
});
