import { fixtureId } from '@nile/test-utils';
import { describe, expect, it } from 'vitest';
import { auditApiQuery, auditFiltersQuery, NO_AUDIT_FILTERS, parseAuditFilters } from './list-params';

const ID = fixtureId(1);

describe('AD-38 list params', () => {
  it('no filters: newest first, empty URL', () => {
    const filters = parseAuditFilters({});
    expect(filters).toEqual(NO_AUDIT_FILTERS);
    expect(auditApiQuery(filters)).toEqual({ sort: '-createdAt' });
    expect(auditFiltersQuery(filters)).toBe('');
  });

  it('round-trips every filter and maps it to the literal API keys', () => {
    const filters = parseAuditFilters({
      actor: ID,
      action: 'seller.approved,admin.invited',
      target: 'seller',
      targetId: ID,
      from: '2026-10-01',
      to: '2026-10-05',
    });
    // Actions kept in catalogue order, so equal filters give equal keys.
    expect(filters.actions).toEqual(['admin.invited', 'seller.approved']);
    expect(auditApiQuery(filters)).toEqual({
      sort: '-createdAt',
      'actorUserId[eq]': ID,
      'action[in]': 'admin.invited,seller.approved',
      'targetType[eq]': 'seller',
      'targetId[eq]': ID,
      'createdAt[gte]': '2026-09-30T21:00:00.000Z',
      'createdAt[lte]': '2026-10-05T20:59:59.999Z',
    });
    expect(parseAuditFilters(Object.fromEntries(new URLSearchParams(auditFiltersQuery(filters))))).toEqual(
      filters,
    );
  });

  it('one action is sent as [eq]', () => {
    expect(auditApiQuery(parseAuditFilters({ action: 'payout.recorded' }))).toEqual({
      sort: '-createdAt',
      'action[eq]': 'payout.recorded',
    });
  });

  it('drops invalid values, a target id without a type, and an end before the start', () => {
    expect(
      parseAuditFilters({
        actor: 'me',
        action: 'nope',
        target: 'planet',
        targetId: ID,
        from: '2026-10-05',
        to: '2026-10-01',
      }),
    ).toEqual({ ...NO_AUDIT_FILTERS, from: '2026-10-05' });
    expect(parseAuditFilters({ target: 'order', targetId: 'abc' })).toEqual({
      ...NO_AUDIT_FILTERS,
      targetType: 'order',
    });
  });
});
