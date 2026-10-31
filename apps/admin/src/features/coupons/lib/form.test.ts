import { cairoLocalToIso } from '@nile/domain';
import { couponFactory, fixtureId } from '@nile/test-utils';
import { describe, expect, it } from 'vitest';
import {
  couponFormValues,
  couponPatch,
  couponSchema,
  emptyCouponValues,
  toCreateBody,
  type CouponFormValues,
} from './form';

const SELLER = fixtureId(1);
const CATEGORY = fixtureId(3001);
const create = couponSchema({ mode: 'create', usedCount: 0 });

const filled = (overrides: Partial<CouponFormValues> = {}): CouponFormValues => ({
  ...emptyCouponValues(Date.parse('2026-10-30T08:00:00.000Z')),
  code: ' nile-15 ',
  discountValue: '15',
  endsAt: '2026-11-30T23:59',
  ...overrides,
});

const issues = (values: CouponFormValues, schema = create) => {
  const result = schema.safeParse(values);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('admin coupon form (spec 03 AD-36, T-M9)', () => {
  it('a new coupon is for all products; the body has no seller or category', () => {
    expect(toCreateBody(create.parse(filled()))).toEqual({
      scope: 'all',
      code: 'NILE-15',
      discountType: 'percent',
      discountValue: '0.1500',
      minItemsSubtotal: '0.00',
      startsAt: '2026-10-30T08:00:00.000Z',
      endsAt: cairoLocalToIso('2026-11-30T23:59'),
      perCustomerLimit: 1,
    });
  });

  it('one seller needs a seller and sends scopeSellerId; one category sends scopeCategoryId only', () => {
    expect(issues(filled({ scope: 'seller' }))).toEqual({ scopeSellerId: 'Choose a seller.' });
    expect(toCreateBody(create.parse(filled({ scope: 'seller', scopeSellerId: SELLER })))).toMatchObject({
      scope: 'seller',
      scopeSellerId: SELLER,
    });
    const category = toCreateBody(
      create.parse(filled({ scope: 'category', scopeCategoryId: CATEGORY, scopeSellerId: SELLER })),
    );
    expect(category).toMatchObject({ scope: 'category', scopeCategoryId: CATEGORY });
    expect(category).not.toHaveProperty('scopeSellerId');
  });
});

describe('admin coupon edit body (spec 03 AD-37, PR-8)', () => {
  const coupon = couponFactory({ funding: 'platform', sellerId: null, scope: 'all' });
  const edit = couponSchema({ mode: 'edit', usedCount: 0 });
  const parsedFrom = (overrides: Partial<CouponFormValues>, from = coupon) =>
    edit.parse({ ...couponFormValues(from), ...overrides });

  it('unchanged → nothing to send', () => {
    expect(couponPatch(parsedFrom({}), coupon)).toBeNull();
  });

  it('a scope change sends its seller with it (the backend clears the old one)', () => {
    expect(couponPatch(parsedFrom({ scope: 'seller', scopeSellerId: SELLER }), coupon)).toEqual({
      scope: 'seller',
      scopeSellerId: SELLER,
    });
    const scoped = { ...coupon, scope: 'seller' as const, scopeSellerId: SELLER };
    expect(couponPatch(parsedFrom({ scope: 'all' }, scoped), scoped)).toEqual({ scope: 'all' });
  });

  it('a used coupon sends only the end, total uses and status', () => {
    const used = { ...coupon, redemptionCount: 2 };
    const values = edit.parse({
      ...couponFormValues(used),
      scope: 'category',
      scopeCategoryId: CATEGORY,
      active: false,
    });
    expect(couponPatch(values, used)).toEqual({ status: 'inactive' });
  });
});
