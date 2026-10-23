import { fixtureId } from '@nile/test-utils';
import { describe, expect, it } from 'vitest';
import { orderApiQuery, orderFiltersQuery, parseOrderFilters } from './list-params';

const CUSTOMER = fixtureId(14301);

describe('order filters (spec 03 AD-14)', () => {
  it('no tab is All, newest first', () => {
    const filters = parseOrderFilters({});
    expect(filters.tab).toBe('all');
    expect(orderApiQuery(filters)).toEqual({ sort: '-createdAt' });
    expect(orderFiltersQuery(filters)).toBe('');
  });

  it('tabs are the SF-17 groups: one status with [eq], several with [in]', () => {
    expect(orderApiQuery(parseOrderFilters({ status: 'awaiting-payment' }))).toEqual({
      sort: '-createdAt',
      'status[eq]': 'pending_payment',
    });
    expect(orderApiQuery(parseOrderFilters({ status: 'in-progress' }))).toEqual({
      sort: '-createdAt',
      'status[in]': 'placed,in_progress',
    });
    expect(orderApiQuery(parseOrderFilters({ status: 'completed' }))).toEqual({
      sort: '-createdAt',
      'status[in]': 'completed,partially_completed',
    });
  });

  it('exact order number (trimmed), customer and Cairo days; the URL round-trips', () => {
    const filters = parseOrderFilters({
      number: ' NM-2026-000001 ',
      customer: CUSTOMER,
      from: '2026-10-01',
      to: '2026-10-01',
    });
    expect(orderApiQuery(filters)).toEqual({
      sort: '-createdAt',
      'orderNumber[eq]': 'NM-2026-000001',
      'customerId[eq]': CUSTOMER,
      'createdAt[gte]': '2026-09-30T21:00:00.000Z',
      'createdAt[lte]': '2026-10-01T20:59:59.999Z',
    });
    expect(parseOrderFilters(Object.fromEntries(new URLSearchParams(orderFiltersQuery(filters))))).toEqual(
      filters,
    );
  });

  it('drops invalid values', () => {
    expect(parseOrderFilters({ status: 'lost', number: '  ', customer: 'x', from: 'y' })).toEqual({
      tab: 'all',
      orderNumber: null,
      customerId: null,
      from: null,
      to: null,
    });
  });
});
