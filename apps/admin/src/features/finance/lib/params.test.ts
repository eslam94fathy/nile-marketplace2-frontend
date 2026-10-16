import { fixtureId } from '@nile/test-utils';
import { describe, expect, it } from 'vitest';
import {
  accountApiQuery,
  accountFiltersQuery,
  entryApiQuery,
  entryFiltersQuery,
  parseAccountFilters,
  parseEntryFilters,
  parsePayoutFilters,
  parseReference,
  parseRemittanceFilters,
  payoutApiQuery,
  payoutFiltersQuery,
  remittanceApiQuery,
} from './params';

const OWNER = fixtureId(9601);

describe('account filters (spec 03 AD-18)', () => {
  it('opens on Sellers, highest balance first', () => {
    const filters = parseAccountFilters({});
    expect(accountApiQuery(filters)).toEqual({ sort: '-balance', 'accountType[eq]': 'seller_payable' });
    expect(accountFiltersQuery(filters)).toBe('');
  });

  it('honours the AD-05 link (`owner`, `type`) and round-trips', () => {
    const filters = parseAccountFilters({ owner: OWNER, type: 'seller_payable' });
    expect(accountApiQuery(filters)).toMatchObject({ 'ownerId[eq]': OWNER });
    const other = parseAccountFilters({ type: 'platform', nonzero: '1', sort: 'updated' });
    expect(accountApiQuery(other)).toEqual({
      sort: '-updatedAt',
      'accountType[in]': 'platform_commission_revenue,platform_delivery_revenue',
      'balance[gt]': '0',
    });
    expect(parseAccountFilters(Object.fromEntries(new URLSearchParams(accountFiltersQuery(other))))).toEqual(
      other,
    );
    expect(accountApiQuery(parseAccountFilters({ type: 'all' }))).toEqual({ sort: '-balance' });
  });

  it('drops invalid values', () => {
    expect(parseAccountFilters({ type: 'x', owner: 'y', sort: 'z', nonzero: 'yes' })).toEqual({
      tab: 'seller_payable',
      nonZero: false,
      ownerId: null,
      sort: 'balance',
    });
  });
});

describe('statement filters (spec 03 AD-19)', () => {
  it('entry types in a fixed order, one as [eq], several as [in]; Cairo days', () => {
    const one = parseEntryFilters({ type: 'seller_payout' });
    expect(entryApiQuery(one)).toEqual({ sort: '-createdAt', 'entryType[eq]': 'seller_payout' });
    const several = parseEntryFilters({ type: 'seller_payout,seller_net_earned,nope', from: '2026-10-01' });
    expect(several.types).toEqual(['seller_net_earned', 'seller_payout']);
    expect(entryApiQuery(several)).toEqual({
      sort: '-createdAt',
      'entryType[in]': 'seller_net_earned,seller_payout',
      'createdAt[gte]': '2026-09-30T21:00:00.000Z',
    });
    expect(entryFiltersQuery(several)).toBe('type=seller_net_earned%2Cseller_payout&from=2026-10-01');
  });
});

describe('remittance and payout filters (spec 03 AD-20, AD-21)', () => {
  it('the AD-11 links: `agent`, `payeeType` + `payeeId`', () => {
    expect(remittanceApiQuery(parseRemittanceFilters({ agent: fixtureId(10001) }))).toEqual({
      sort: '-createdAt',
      'agentId[eq]': fixtureId(10001),
    });
    const payouts = parsePayoutFilters({ payeeType: 'agent', payeeId: fixtureId(10001) });
    expect(payoutApiQuery(payouts)).toEqual({
      sort: '-createdAt',
      'payeeType[eq]': 'agent',
      'payeeId[eq]': fixtureId(10001),
    });
    expect(payoutFiltersQuery(payouts)).toBe(`payeeType=agent&payeeId=${fixtureId(10001)}`);
  });

  it('a payee id means nothing without its type; no type is All', () => {
    expect(parsePayoutFilters({ payeeId: OWNER })).toEqual({
      payeeType: null,
      payeeId: null,
      from: null,
      to: null,
    });
  });
});

describe('reference (spec 03 AD-22)', () => {
  it('both parts or nothing', () => {
    expect(parseReference({ referenceType: 'payout', referenceId: OWNER })).toEqual({
      referenceType: 'payout',
      referenceId: OWNER,
    });
    expect(parseReference({ referenceType: 'payout' })).toBeNull();
    expect(parseReference({ referenceType: 'invoice', referenceId: OWNER })).toBeNull();
  });
});
