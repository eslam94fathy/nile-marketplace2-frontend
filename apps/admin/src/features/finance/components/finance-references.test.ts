import { financeAccountFactory, fixtureId, ledgerEntryFactory } from '@nile/test-utils';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_TABS, accountApiQuery, parseAccountFilters } from '../lib/params';
import { referenceHref } from './statement';

describe('finance in Release 2 (spec 03 AD-18, AD-19, T-M8)', () => {
  it('the new accounts have their own tabs', () => {
    expect(Object.keys(ACCOUNT_TABS)).toEqual([
      'seller_payable',
      'seller_pending',
      'agent_fee_payable',
      'agent_cod_cash',
      'customer_refund_payable',
      'platform',
      'platform_promotions',
      'all',
    ]);
    expect(accountApiQuery(parseAccountFilters({ type: 'customer_refund_payable' }))).toMatchObject({
      'accountType[eq]': 'customer_refund_payable',
    });
  });

  it('return, refund and hold references link to AD-33, AD-34 and the hold in the reference lookup', () => {
    const account = financeAccountFactory({ accountType: 'seller_pending' });
    const id = fixtureId(17777);
    const href = (referenceType: 'return' | 'refund' | 'seller_order_hold') =>
      referenceHref(ledgerEntryFactory({ referenceType, referenceId: id }), account);
    expect(href('return')).toBe(`/returns/${id}`);
    expect(href('refund')).toBe(`/refunds/${id}`);
    expect(href('seller_order_hold')).toBe(
      `/finance/lookup?referenceType=seller_order_hold&referenceId=${id}`,
    );
  });
});
