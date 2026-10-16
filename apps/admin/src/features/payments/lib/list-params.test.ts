import { describe, expect, it } from 'vitest';
import { parseRefundFilters, refundApiQuery, refundFiltersQuery } from './list-params';

describe('refund filters (spec 03 AD-16)', () => {
  it('opens on To record, oldest first', () => {
    const filters = parseRefundFilters({});
    expect(refundApiQuery(filters)).toEqual({ sort: 'createdAt', 'status[eq]': 'pending_manual' });
    expect(refundFiltersQuery(filters)).toBe('');
  });

  it('Recorded is newest first; reasons go as [in] in a fixed order; the URL round-trips', () => {
    const filters = parseRefundFilters({
      status: 'recorded',
      reason: 'delivery_failed,seller_order_cancelled,bogus',
      from: '2026-10-01',
    });
    expect(filters.reasons).toEqual(['seller_order_cancelled', 'delivery_failed']);
    expect(refundApiQuery(filters)).toEqual({
      sort: '-createdAt',
      'status[eq]': 'recorded',
      'reason[in]': 'seller_order_cancelled,delivery_failed',
      'createdAt[gte]': '2026-09-30T21:00:00.000Z',
    });
    expect(parseRefundFilters(Object.fromEntries(new URLSearchParams(refundFiltersQuery(filters))))).toEqual(
      filters,
    );
  });

  it('drops invalid values', () => {
    expect(parseRefundFilters({ status: 'x', reason: 'nope', from: '2026-10-05', to: '2026-10-01' })).toEqual(
      {
        status: 'pending_manual',
        reasons: [],
        from: '2026-10-05',
        to: null,
      },
    );
  });
});
