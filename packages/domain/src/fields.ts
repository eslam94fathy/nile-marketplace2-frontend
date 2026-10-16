import './zod-config';
import { z } from 'zod';
import { percentToRate } from './money';

// Shared Zod field schemas mirroring the backend DTO rules (backend `src/lib/http/validation/*`,
// conventions §5). Forms compose them in `features/<f>/schemas.ts`. The backend stays the final check.

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt reads only the first 72 bytes, so the backend rejects longer passwords. */
export const PASSWORD_MAX_BYTES = 72;
export const EG_PHONE_PREFIX = '+20';

export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
export const POSITIVE_MONEY_PATTERN = /^(?!0+(\.0{1,2})?$)\d{1,10}(\.\d{1,2})?$/;
export const EG_MOBILE_PATTERN = /^\+20(10|11|12|15)\d{8}$/;
export const OTP_PATTERN = /^\d{6}$/;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The 10 digits typed after the fixed `+20` prefix (conventions §5). */
const EG_MOBILE_LOCAL_PATTERN = /^(10|11|12|15)\d{8}$/;

/** Field rule messages (conventions §4: the field's own rule text, never the backend message). */
export const FIELD_MESSAGES = {
  required: 'This field is required.',
  email: 'Enter a valid email address.',
  emailTooLong: `Email must be at most ${EMAIL_MAX_LENGTH} characters.`,
  passwordTooShort: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  passwordTooLong: 'Password is too long',
  egPhone: 'Enter a mobile number starting with 10, 11, 12 or 15.',
  otp: 'Enter the 6-digit code.',
  money: 'Enter an amount with up to 2 decimals.',
  positiveMoney: 'Enter an amount greater than 0 with up to 2 decimals.',
  percent: 'Enter a percentage from 0 to 100 with up to 2 decimals.',
  slug: 'Use lower-case letters, digits and single hyphens.',
  tooShort: (min: number) => `Must be at least ${min} characters.`,
  tooLong: (max: number) => `Must be at most ${max} characters.`,
} as const;

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).length;

/** Trimmed, then lower-cased, ≤ 254 characters (backend `EmailField`). */
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, FIELD_MESSAGES.required)
  .max(EMAIL_MAX_LENGTH, FIELD_MESSAGES.emailTooLong)
  .pipe(z.email(FIELD_MESSAGES.email));

/** A new password: ≥ 8 characters, ≤ 72 UTF-8 bytes, never trimmed (backend `PasswordField`). */
export const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, FIELD_MESSAGES.passwordTooShort)
  .refine((value) => utf8Bytes(value) <= PASSWORD_MAX_BYTES, FIELD_MESSAGES.passwordTooLong);

/** An existing password (sign-in, change password): 1..72 bytes, no policy check, never trimmed. */
export const currentPassword = z
  .string()
  .min(1, FIELD_MESSAGES.required)
  .refine((value) => utf8Bytes(value) <= PASSWORD_MAX_BYTES, FIELD_MESSAGES.passwordTooLong);

/**
 * The digits typed after the fixed `+20` prefix, sent as E.164: a leading `0` is dropped
 * (`01012345678` → `+201012345678`, conventions §5).
 */
export const egPhone = z
  .string()
  .trim()
  .transform((value) => (value.startsWith('0') ? value.slice(1) : value))
  .pipe(z.string().regex(EG_MOBILE_LOCAL_PATTERN, FIELD_MESSAGES.egPhone))
  .transform((local) => `${EG_PHONE_PREFIX}${local}`);

/** E.164 from the API back to the digits shown after the `+20` prefix (to prefill a form). */
export function toLocalPhone(e164: string): string {
  return EG_MOBILE_PATTERN.test(e164) ? e164.slice(EG_PHONE_PREFIX.length) : e164;
}

/** Six digits; surrounding spaces from a paste are removed. */
export const otp = z.string().trim().regex(OTP_PATTERN, FIELD_MESSAGES.otp);

/** Decimal string with up to 10 integer digits and 2 decimals, e.g. "150.00" (backend `IsMoney`). */
export const money = z.string().trim().regex(MONEY_PATTERN, FIELD_MESSAGES.money);

/** As `money`, but greater than 0 (backend `IsPositiveMoney`, e.g. a variant price). */
export const positiveMoney = z.string().trim().regex(POSITIVE_MONEY_PATTERN, FIELD_MESSAGES.positiveMoney);

/**
 * A rate typed as a percent, 0..100 with up to 2 decimals (spec 03 §2.2, AD-Q-6), sent as the API's fraction
 * string with decimal arithmetic: `'12.5'` → `'0.1250'`.
 */
export const percentRate = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, FIELD_MESSAGES.percent)
  .refine((value) => Number(value) <= 100, FIELD_MESSAGES.percent)
  .transform((value) => percentToRate(value));

/** Lower-case kebab-case of `min..max` characters (backend `SlugField`; not trimmed there either). */
export const slug = (min: number, max: number) =>
  z
    .string()
    .min(min, FIELD_MESSAGES.tooShort(min))
    .max(max, FIELD_MESSAGES.tooLong(max))
    .regex(SLUG_PATTERN, FIELD_MESSAGES.slug);

/** Trimmed, then `min..max` characters (backend `StrField`). */
export const trimmedString = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? FIELD_MESSAGES.required : FIELD_MESSAGES.tooShort(min))
    .max(max, FIELD_MESSAGES.tooLong(max));

/**
 * An optional nullable text field: trimmed, empty becomes `null`, otherwise `min..max` characters.
 * Whether `null` is sent (edit) or the key omitted (create) is decided when the body is built (conventions §5).
 */
export const nullableTrimmedString = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .pipe(trimmedString(min, max).nullable());
