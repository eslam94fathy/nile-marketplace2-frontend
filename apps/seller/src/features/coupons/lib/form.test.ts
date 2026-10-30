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

const CATEGORY = fixtureId(3001);
const create = couponSchema({ mode: 'create', usedCount: 0 });

const filled = (overrides: Partial<CouponFormValues> = {}): CouponFormValues => ({
  ...emptyCouponValues(Date.parse('2026-10-30T08:00:00.000Z')),
  code: ' save-10 ',
  discountValue: '12.5',
  endsAt: '2026-11-30T23:59',
  ...overrides,
});

const issues = (values: CouponFormValues, schema = create) => {
  const result = schema.safeParse(values);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('coupon form rules (spec 02 SE-22)', () => {
  it('code trimmed and upper-cased; percent sent as a rate; times as UTC ISO', () => {
    const result = create.parse(filled());
    expect(result.code).toBe('SAVE-10');
    expect(result.discountValue).toBe('0.1250');
    expect(result.startsAt).toBe('2026-10-30T08:00:00.000Z');
    expect(result.endsAt).toBe(cairoLocalToIso('2026-11-30T23:59'));
  });

  it('refuses a short code, a percent outside 1–90, a zero fixed amount', () => {
    expect(issues(filled({ code: 'ab' }))).toHaveProperty('code');
    expect(issues(filled({ discountValue: '0.5' }))).toHaveProperty('discountValue');
    expect(issues(filled({ discountValue: '91' }))).toHaveProperty('discountValue');
    expect(issues(filled({ discountValue: '90' }))).toEqual({});
    expect(issues(filled({ discountType: 'fixed', discountValue: '0' }))).toHaveProperty('discountValue');
  });

  it('a category scope needs a category; the end comes after the start', () => {
    expect(issues(filled({ scope: 'category' }))).toHaveProperty('scopeCategoryId');
    expect(issues(filled({ endsAt: '2026-10-30T10:00' }))).toEqual({
      endsAt: 'The end must be after the start.',
    });
  });

  it('total uses 1..1000000 and never below the uses so far; per customer 1..100', () => {
    expect(issues(filled({ globalLimit: '0' }))).toHaveProperty('globalLimit');
    expect(issues(filled({ perCustomerLimit: '101' }))).toHaveProperty('perCustomerLimit');
    expect(issues(filled({ globalLimit: '2' }), couponSchema({ mode: 'edit', usedCount: 3 }))).toEqual({
      globalLimit: "Total uses can't be below the 3 uses so far.",
    });
  });

  it('create body: the documented fields only; the maximum only for percent', () => {
    expect(toCreateBody(create.parse(filled({ maxDiscount: '50' })))).toEqual({
      scope: 'seller',
      code: 'SAVE-10',
      discountType: 'percent',
      discountValue: '0.1250',
      maxDiscount: '50',
      minItemsSubtotal: '0.00',
      startsAt: '2026-10-30T08:00:00.000Z',
      endsAt: cairoLocalToIso('2026-11-30T23:59'),
      perCustomerLimit: 1,
    });
    const fixed = toCreateBody(
      create.parse(
        filled({
          discountType: 'fixed',
          discountValue: '25',
          maxDiscount: '50',
          scope: 'category',
          scopeCategoryId: CATEGORY,
          globalLimit: '100',
        }),
      ),
    );
    expect(fixed).not.toHaveProperty('maxDiscount');
    expect(fixed).toMatchObject({ scope: 'category', scopeCategoryId: CATEGORY, globalLimit: 100 });
  });
});

describe('coupon edit body (spec 02 SE-23, PR-8)', () => {
  const coupon = couponFactory({ maxDiscount: '50.00', startsAt: '2026-10-01T07:00:30.000Z' });
  const edit = couponSchema({ mode: 'edit', usedCount: 0 });
  const parsedFrom = (overrides: Partial<CouponFormValues>) =>
    edit.parse({ ...couponFormValues(coupon), ...overrides });

  it('unchanged (seconds dropped by the minute input) → nothing to send', () => {
    expect(couponPatch(parsedFrom({}), coupon)).toBeNull();
  });

  it('only changed fields; leaving percent clears the maximum and sends the value', () => {
    expect(couponPatch(parsedFrom({ perCustomerLimit: '2', active: false }), coupon)).toEqual({
      perCustomerLimit: 2,
      status: 'inactive',
    });
    expect(couponPatch(parsedFrom({ discountType: 'fixed', discountValue: '10' }), coupon)).toEqual({
      discountType: 'fixed',
      discountValue: '10',
      maxDiscount: null,
    });
  });

  it('a used coupon sends only the end, total uses and status', () => {
    const used = { ...coupon, redemptionCount: 3 };
    const values = edit.parse({
      ...couponFormValues(used),
      perCustomerLimit: '5',
      globalLimit: '10',
      endsAt: '2999-02-01T09:00',
    });
    expect(couponPatch(values, used)).toEqual({
      globalLimit: 10,
      endsAt: cairoLocalToIso('2999-02-01T09:00'),
    });
  });
});
