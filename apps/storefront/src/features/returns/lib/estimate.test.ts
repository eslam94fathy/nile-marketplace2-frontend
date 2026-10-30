import { describe, expect, it } from 'vitest';
import { requestBody, requestReturnSchema } from '../schemas';
import { estimateRefund, refundTooLow } from './estimate';

describe('return estimate (spec 01 SF-26, SF-Q-19)', () => {
  const lines = [
    { paidUnitAmount: '120.50', quantity: 2 },
    { paidUnitAmount: '33.33', quantity: 3 },
    { paidUnitAmount: '999.99', quantity: 0 },
  ];

  it('seller-fault reasons: the items value, no fee', () => {
    expect(estimateRefund(lines, '45.00', 'damaged')).toEqual({
      itemsValue: '340.99',
      fee: null,
      refund: '340.99',
    });
  });

  it('"Changed my mind": the return fee is taken from the refund', () => {
    expect(estimateRefund(lines, '45.00', 'changed_mind')).toEqual({
      itemsValue: '340.99',
      fee: '45.00',
      refund: '295.99',
    });
  });

  it('no reason yet: no fee', () => {
    expect(estimateRefund(lines, '45.00', null).fee).toBeNull();
  });

  it('a refund at or below zero is too low', () => {
    expect(
      refundTooLow(estimateRefund([{ paidUnitAmount: '30.00', quantity: 1 }], '45.00', 'changed_mind')),
    ).toBe(true);
    expect(
      refundTooLow(estimateRefund([{ paidUnitAmount: '45.00', quantity: 1 }], '45.00', 'changed_mind')),
    ).toBe(true);
    expect(
      refundTooLow(estimateRefund([{ paidUnitAmount: '45.01', quantity: 1 }], '45.00', 'changed_mind')),
    ).toBe(false);
  });
});

describe('POST /returns body (RequestReturnDto)', () => {
  const values = {
    quantities: { a: 2, b: 0 },
    reason: 'damaged' as const,
    description: '  Cracked  ',
    payoutMethod: 'mobile_wallet' as const,
    walletNumber: '01012345678',
    instapayAddress: '',
  };

  it('COD: items with a quantity, trimmed description, photos, the wallet in E.164', () => {
    const parsed = requestReturnSchema(true).parse(values);
    expect(requestBody(parsed, 'so-1', ['m1'], true)).toEqual({
      sellerOrderId: 'so-1',
      reason: 'damaged',
      items: [{ orderItemId: 'a', quantity: 2 }],
      description: 'Cracked',
      photoMediaIds: ['m1'],
      refundPayout: { method: 'mobile_wallet', walletNumber: '+201012345678' },
    });
  });

  it('card: never a payout; an empty description is left out', () => {
    const parsed = requestReturnSchema(false).parse({ ...values, description: ' ', payoutMethod: null });
    expect(requestBody(parsed, 'so-1', [], false)).toEqual({
      sellerOrderId: 'so-1',
      reason: 'damaged',
      items: [{ orderItemId: 'a', quantity: 2 }],
    });
  });

  it('COD needs a payout method and a valid wallet or InstaPay address', () => {
    const cod = requestReturnSchema(true);
    expect(cod.safeParse({ ...values, payoutMethod: null }).success).toBe(false);
    expect(cod.safeParse({ ...values, walletNumber: '0123' }).success).toBe(false);
    expect(cod.safeParse({ ...values, payoutMethod: 'instapay', instapayAddress: 'ab' }).success).toBe(false);
    const instapay = cod.parse({ ...values, payoutMethod: 'instapay', instapayAddress: ' mona@instapay ' });
    expect(requestBody(instapay, 'so-1', [], true).refundPayout).toEqual({
      method: 'instapay',
      instapayAddress: 'mona@instapay',
    });
  });

  it('a reason is required', () => {
    expect(requestReturnSchema(false).safeParse({ ...values, reason: null }).success).toBe(false);
  });
});
