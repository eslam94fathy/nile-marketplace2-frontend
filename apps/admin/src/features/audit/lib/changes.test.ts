import { describe, expect, it } from 'vitest';
import { changeRows } from './changes';

describe('AD-39 change rows (AD-Q-17)', () => {
  it('labels known fields and formats rates, money and statuses of the target', () => {
    expect(
      changeRows({ before: { commissionRate: '0.1000' }, after: { commissionRate: '0.1250' } }, 'seller'),
    ).toEqual([{ field: 'commissionRate', label: 'Commission rate', before: '10%', after: '12.5%' }]);
    const [fee] = changeRows(
      { before: { deliveryFee: '50.00' }, after: { deliveryFee: '60.00' } },
      'governorate',
    );
    expect(fee?.label).toBe('Delivery fee');
    expect(fee?.after).toMatch(/60\.00/);
    expect(changeRows({ before: { status: 'approved' }, after: { status: 'suspended' } }, 'seller')).toEqual([
      { field: 'status', label: 'Status', before: 'Approved', after: 'Suspended' },
    ]);
  });

  it('a create has no before: those cells are not recorded; null, booleans and unknown fields stay readable', () => {
    expect(
      changeRows(
        { before: {}, after: { name: 'Shoes', isActive: true, parentId: null, futureField: 7 } },
        'category',
      ),
    ).toEqual([
      { field: 'name', label: 'Name', before: null, after: 'Shoes' },
      { field: 'isActive', label: 'Active', before: null, after: 'Yes' },
      { field: 'parentId', label: 'Parent category', before: null, after: 'None' },
      { field: 'futureField', label: 'futureField', before: null, after: '7' },
    ]);
  });

  it('a coupon discount follows its type on the same side; without it, raw', () => {
    const [, value] = changeRows(
      { before: {}, after: { discountType: 'percent', discountValue: '0.1500' } },
      'coupon',
    );
    expect(value?.after).toBe('15%');
    expect(
      changeRows({ before: { discountValue: '0.1000' }, after: { discountValue: '0.2000' } }, 'coupon'),
    ).toEqual([{ field: 'discountValue', label: 'Discount', before: '0.1000', after: '0.2000' }]);
  });

  it('a value a formatter refuses is shown as sent, and an unknown status raw', () => {
    expect(changeRows({ before: { amount: 'lots' }, after: { status: 'teleported' } }, 'payout')).toEqual([
      { field: 'amount', label: 'Amount', before: 'lots', after: null },
      { field: 'status', label: 'Status', before: null, after: 'teleported' },
    ]);
  });
});
