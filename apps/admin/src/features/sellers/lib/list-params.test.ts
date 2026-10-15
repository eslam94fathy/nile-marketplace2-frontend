import { fixtureId } from '@nile/test-utils';
import { describe, expect, it } from 'vitest';
import { statusActorRole } from '../components/seller-detail';
import { parseSellerFilters, sellerApiQuery, sellerFiltersQuery } from './list-params';

const GOV = fixtureId(9700);

describe('seller list filters, URL ⇄ API (spec 03 AD-04)', () => {
  it('no status is the Pending tab, oldest first; "all" is every status, newest first', () => {
    const pending = parseSellerFilters({});
    expect(pending.status).toBe('pending_approval');
    expect(sellerApiQuery(pending)).toEqual({ sort: 'createdAt', 'status[eq]': 'pending_approval' });
    expect(sellerFiltersQuery(pending)).toBe('');
    const all = parseSellerFilters({ status: 'all' });
    expect(all.status).toBeNull();
    expect(sellerApiQuery(all)).toEqual({ sort: '-createdAt' });
    expect(sellerFiltersQuery(all)).toBe('status=all');
  });

  it('name, governorate and Cairo days map to literal keys (summer time: UTC+3)', () => {
    const filters = parseSellerFilters({
      status: 'approved',
      name: ' Crafts ',
      governorate: GOV,
      from: '2026-07-01',
      to: '2026-07-31',
    });
    expect(sellerApiQuery(filters)).toEqual({
      sort: '-createdAt',
      'status[eq]': 'approved',
      'businessName[like]': 'Crafts',
      'pickupGovernorateId[eq]': GOV,
      'createdAt[gte]': '2026-06-30T21:00:00.000Z',
      'createdAt[lte]': '2026-07-31T20:59:59.999Z',
    });
    expect(sellerFiltersQuery(filters)).toBe(
      `status=approved&name=Crafts&governorate=${GOV}&from=2026-07-01&to=2026-07-31`,
    );
  });

  it('invalid values are dropped (R-28); an end before the start is dropped', () => {
    expect(
      parseSellerFilters({
        status: 'banned',
        governorate: 'x',
        from: '2026-13-01',
        to: 'tomorrow',
        name: '',
      }),
    ).toEqual({ status: 'pending_approval', name: null, governorateId: null, from: null, to: null });
    expect(parseSellerFilters({ from: '2026-07-10', to: '2026-07-01' })).toMatchObject({
      from: '2026-07-10',
      to: null,
    });
  });
});

describe('status history actor (AD-Q-2)', () => {
  it('registration and re-apply are the seller; every other change is an admin', () => {
    expect(statusActorRole({ fromStatus: null, toStatus: 'pending_approval' })).toBe('seller');
    expect(statusActorRole({ fromStatus: 'rejected', toStatus: 'pending_approval' })).toBe('seller');
    expect(statusActorRole({ fromStatus: 'pending_approval', toStatus: 'approved' })).toBe('admin');
    expect(statusActorRole({ fromStatus: 'approved', toStatus: 'suspended' })).toBe('admin');
  });
});
