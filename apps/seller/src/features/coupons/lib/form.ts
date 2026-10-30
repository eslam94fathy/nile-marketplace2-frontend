import type { Schema } from '@nile/api';
import {
  cairoLocalFromMs,
  cairoLocalToIso,
  fields,
  parseMoney,
  percentToRate,
  ratePercentValue,
} from '@nile/domain';
import * as z from 'zod';
import type { Coupon } from '../api';
import { COUPONS_COPY } from '../copy';

// SE-22 / SE-23 form (spec 02 §8.3, backend spec 19 §1.1, §4): one schema for create and edit. Percent discounts
// are typed as a percent and sent as a rate with decimal arithmetic (SE-Q-10); times are Cairo wall-clock
// `datetime-local` values sent as UTC ISO.

const INVALID = COUPONS_COPY.invalid;

export const COUPON_CODE_PATTERN = /^[A-Z0-9-]{4,32}$/;
const PERCENT_PATTERN = /^\d{1,2}(\.\d{1,2})?$/;
const WHOLE_NUMBER = /^\d{1,7}$/;
const PERCENT_MIN = 1;
const PERCENT_MAX = 90;
export const GLOBAL_LIMIT_MAX = 1_000_000;
export const PER_CUSTOMER_MAX = 100;
const MINUTE_MS = 60_000;

export type DiscountType = Coupon['discountType'];
export type SellerScope = 'seller' | 'category';

export interface CouponFormValues {
  readonly code: string;
  readonly discountType: DiscountType;
  readonly discountValue: string;
  readonly maxDiscount: string;
  readonly minItemsSubtotal: string;
  readonly scope: SellerScope;
  readonly scopeCategoryId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly globalLimit: string;
  readonly perCustomerLimit: string;
  readonly active: boolean;
}

export interface CouponOutput {
  readonly code: string;
  readonly discountType: DiscountType;
  /** A rate (`'0.1000'`) for percent, an amount for fixed. */
  readonly discountValue: string;
  readonly maxDiscount: string | null;
  readonly minItemsSubtotal: string;
  readonly scope: SellerScope;
  readonly scopeCategoryId: string | null;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly globalLimit: number | null;
  readonly perCustomerLimit: number;
  readonly status: Coupon['status'];
}

export interface CouponSchemaOptions {
  readonly mode: 'create' | 'edit';
  /** Redemptions so far (edit): total uses can't go below it. */
  readonly usedCount: number;
}

const inRange = (value: string, min: number, max: number) =>
  WHOLE_NUMBER.test(value) && Number(value) >= min && Number(value) <= max;

export function couponSchema({ mode, usedCount }: CouponSchemaOptions) {
  return z
    .object({
      code:
        mode === 'create'
          ? z.string().trim().toUpperCase().regex(COUPON_CODE_PATTERN, INVALID.code)
          : z.string(),
      discountType: z.enum(['percent', 'fixed']),
      discountValue: z.string().trim(),
      maxDiscount: z.string().trim(),
      minItemsSubtotal: fields.money,
      scope: z.enum(['seller', 'category']),
      scopeCategoryId: z.string(),
      startsAt: z.string(),
      endsAt: z.string(),
      globalLimit: z.string().trim(),
      perCustomerLimit: z.string().trim(),
      active: z.boolean(),
    })
    .superRefine((values, ctx) => {
      const issue = (path: keyof CouponFormValues, message: string) => {
        ctx.addIssue({ code: 'custom', path: [path], message });
      };
      if (values.discountType === 'percent') {
        const percent = Number(values.discountValue);
        if (!PERCENT_PATTERN.test(values.discountValue) || percent < PERCENT_MIN || percent > PERCENT_MAX) {
          issue('discountValue', INVALID.percent);
        }
        if (values.maxDiscount !== '' && !fields.POSITIVE_MONEY_PATTERN.test(values.maxDiscount)) {
          issue('maxDiscount', fields.FIELD_MESSAGES.positiveMoney);
        }
      } else if (!fields.POSITIVE_MONEY_PATTERN.test(values.discountValue)) {
        issue('discountValue', fields.FIELD_MESSAGES.positiveMoney);
      }
      if (values.scope === 'category' && values.scopeCategoryId === '')
        issue('scopeCategoryId', INVALID.category);
      const starts = cairoLocalToIso(values.startsAt);
      const ends = cairoLocalToIso(values.endsAt);
      if (starts === null) issue('startsAt', INVALID.dateTime);
      if (ends === null) issue('endsAt', INVALID.dateTime);
      if (starts !== null && ends !== null && Date.parse(ends) <= Date.parse(starts)) {
        issue('endsAt', INVALID.endsAfterStart);
      }
      if (values.globalLimit !== '') {
        if (!inRange(values.globalLimit, 1, GLOBAL_LIMIT_MAX)) issue('globalLimit', INVALID.globalLimit);
        else if (Number(values.globalLimit) < usedCount) {
          issue('globalLimit', INVALID.globalLimitBelowUses(usedCount));
        }
      }
      if (!inRange(values.perCustomerLimit, 1, PER_CUSTOMER_MAX)) {
        issue('perCustomerLimit', INVALID.perCustomerLimit);
      }
    })
    .transform((values): CouponOutput => ({
      code: values.code,
      discountType: values.discountType,
      discountValue:
        values.discountType === 'percent' ? percentToRate(values.discountValue) : values.discountValue,
      maxDiscount: values.discountType === 'percent' && values.maxDiscount !== '' ? values.maxDiscount : null,
      minItemsSubtotal: values.minItemsSubtotal,
      scope: values.scope,
      scopeCategoryId: values.scope === 'category' ? values.scopeCategoryId : null,
      // Checked above: both are valid here.
      startsAt: cairoLocalToIso(values.startsAt) ?? '',
      endsAt: cairoLocalToIso(values.endsAt) ?? '',
      globalLimit: values.globalLimit === '' ? null : Number(values.globalLimit),
      perCustomerLimit: Number(values.perCustomerLimit),
      status: values.active ? 'active' : 'inactive',
    }));
}

/** A new coupon: percent, no minimum, all my products, starting now, once per customer. */
export function emptyCouponValues(nowMs: number): CouponFormValues {
  return {
    code: '',
    discountType: 'percent',
    discountValue: '',
    maxDiscount: '',
    minItemsSubtotal: '0.00',
    scope: 'seller',
    scopeCategoryId: '',
    startsAt: cairoLocalFromMs(nowMs),
    endsAt: '',
    globalLimit: '',
    perCustomerLimit: '1',
    active: true,
  };
}

export function couponFormValues(coupon: Coupon): CouponFormValues {
  return {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue:
      coupon.discountType === 'percent' ? ratePercentValue(coupon.discountValue) : coupon.discountValue,
    maxDiscount: coupon.maxDiscount ?? '',
    minItemsSubtotal: coupon.minItemsSubtotal,
    scope: coupon.scope === 'category' ? 'category' : 'seller',
    scopeCategoryId: coupon.scopeCategoryId ?? '',
    startsAt: cairoLocalFromMs(Date.parse(coupon.startsAt)),
    endsAt: cairoLocalFromMs(Date.parse(coupon.endsAt)),
    globalLimit: coupon.globalLimit === null ? '' : String(coupon.globalLimit),
    perCustomerLimit: String(coupon.perCustomerLimit),
    active: coupon.status === 'active',
  };
}

export function toCreateBody(values: CouponOutput): Schema<'SellerCreateCouponDto'> {
  return {
    scope: values.scope,
    code: values.code,
    discountType: values.discountType,
    discountValue: values.discountValue,
    ...(values.maxDiscount === null ? {} : { maxDiscount: values.maxDiscount }),
    minItemsSubtotal: values.minItemsSubtotal,
    ...(values.scopeCategoryId === null ? {} : { scopeCategoryId: values.scopeCategoryId }),
    startsAt: values.startsAt,
    endsAt: values.endsAt,
    ...(values.globalLimit === null ? {} : { globalLimit: values.globalLimit }),
    perCustomerLimit: values.perCustomerLimit,
  };
}

const sameMoney = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : parseMoney(a).equals(parseMoney(b));
/** `datetime-local` keeps minutes: an instant compares by its minute. */
const sameMinute = (a: string, b: string) =>
  Math.floor(Date.parse(a) / MINUTE_MS) === Math.floor(Date.parse(b) / MINUTE_MS);

/** After the first use only these can change [SPEC 19 PR-8]. */
export const isLocked = (coupon: Coupon): boolean => coupon.redemptionCount > 0;

/**
 * Only changed fields (CLAUDE.md §3); `null` when nothing changed. A used coupon only sends the end, total uses
 * and status (PR-8). A type change sends the value with it; leaving percent clears the maximum.
 */
export function couponPatch(values: CouponOutput, coupon: Coupon): Schema<'SellerUpdateCouponDto'> | null {
  const typeChanged = values.discountType !== coupon.discountType;
  const open = !isLocked(coupon);
  const patch: Schema<'SellerUpdateCouponDto'> = {
    ...(open && typeChanged ? { discountType: values.discountType } : {}),
    // Rates are compared as the API's 4-decimal strings (percentToRate gives the same form); amounts by value.
    ...(open &&
    (typeChanged ||
      (values.discountType === 'percent'
        ? values.discountValue !== coupon.discountValue
        : !sameMoney(values.discountValue, coupon.discountValue)))
      ? { discountValue: values.discountValue }
      : {}),
    ...(open && !sameMoney(values.maxDiscount, coupon.maxDiscount)
      ? { maxDiscount: values.maxDiscount }
      : {}),
    ...(open && !sameMoney(values.minItemsSubtotal, coupon.minItemsSubtotal)
      ? { minItemsSubtotal: values.minItemsSubtotal }
      : {}),
    ...(open && values.scope !== coupon.scope ? { scope: values.scope } : {}),
    ...(open && values.scopeCategoryId !== coupon.scopeCategoryId
      ? { scopeCategoryId: values.scopeCategoryId }
      : {}),
    ...(open && !sameMinute(values.startsAt, coupon.startsAt) ? { startsAt: values.startsAt } : {}),
    ...(open && values.perCustomerLimit !== coupon.perCustomerLimit
      ? { perCustomerLimit: values.perCustomerLimit }
      : {}),
    ...(sameMinute(values.endsAt, coupon.endsAt) ? {} : { endsAt: values.endsAt }),
    ...(values.globalLimit === coupon.globalLimit ? {} : { globalLimit: values.globalLimit }),
    ...(values.status === coupon.status ? {} : { status: values.status }),
  };
  return Object.keys(patch).length === 0 ? null : patch;
}
