import { describe, expect, it } from 'vitest';
import { parseCustomerFilters, customerApiQuery } from '../../customers/lib/list-params';
import { parseUserFilters, userApiQuery, userFiltersQuery } from './list-params';

describe('AD-24 user filters (URL ⇄ API)', () => {
  it('no filters: every user, newest first', () => {
    expect(userApiQuery(parseUserFilters({}))).toEqual({ sort: '-createdAt' });
  });

  it('role, status, email prefix and Cairo days map to literal keys', () => {
    const filters = parseUserFilters({
      role: 'delivery_agent',
      status: 'invited',
      email: '  Ops ',
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(userApiQuery(filters)).toEqual({
      sort: '-createdAt',
      'role[eq]': 'delivery_agent',
      'status[eq]': 'invited',
      'email[like]': 'Ops',
      'createdAt[gte]': '2026-09-30T21:00:00.000Z',
      'createdAt[lte]': '2026-10-31T21:59:59.999Z',
    });
    expect(userFiltersQuery(filters)).toBe(
      'role=delivery_agent&status=invited&email=Ops&from=2026-10-01&to=2026-10-31',
    );
  });

  it('invalid values are dropped, never sent', () => {
    expect(
      parseUserFilters({ role: 'owner', status: 'deleted', email: 'x'.repeat(255), from: '2026-13-01' }),
    ).toEqual({ role: null, status: null, email: null, from: null, to: null });
    // A range ending before it starts loses its end.
    expect(parseUserFilters({ from: '2026-10-10', to: '2026-10-01' }).to).toBeNull();
  });
});

describe('AD-25 customer filters (URL ⇄ API)', () => {
  it('name contains and a whole E.164 phone', () => {
    expect(customerApiQuery(parseCustomerFilters({ name: ' Mona Ali ', phone: '+201012345678' }))).toEqual({
      sort: '-createdAt',
      'name[like]': 'Mona Ali',
      'phone[eq]': '+201012345678',
    });
  });

  it('a phone that is not a whole Egyptian mobile is dropped', () => {
    expect(parseCustomerFilters({ phone: '+20101234' }).phone).toBeNull();
    expect(parseCustomerFilters({ phone: '01012345678' }).phone).toBeNull();
  });
});
