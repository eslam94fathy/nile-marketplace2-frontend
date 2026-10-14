import type { Schema } from '@nile/api';
import { fields } from '@nile/domain';
import { z } from 'zod';
import { AUTH_COPY } from './copy';

// One schema per form (CLAUDE.md §6), from the shared field rules that mirror the backend DTOs. Passwords are
// never trimmed; emails are trimmed and lower-cased.

export const signInSchema = z.object({
  email: fields.email,
  password: fields.currentPassword,
});
export type SignInValues = z.input<typeof signInSchema>;

/** The confirmation must repeat the password (UI-only check, spec 01 SF-11). Used by registration forms too. */
export const confirmationMatches = {
  check: (values: { password: string; confirmPassword: string }) =>
    values.password === values.confirmPassword,
  issue: { path: ['confirmPassword'], message: AUTH_COPY.errors.passwordsDiffer },
};

export const verifyEmailSchema = z.object({ email: fields.email, otp: fields.otp });
export type VerifyEmailValues = z.input<typeof verifyEmailSchema>;

export const emailOnlySchema = z.object({ email: fields.email });
export type EmailOnlyValues = z.input<typeof emailOnlySchema>;

export const resetPasswordSchema = z
  .object({ email: fields.email, otp: fields.otp, password: fields.password, confirmPassword: z.string() })
  .refine(confirmationMatches.check, confirmationMatches.issue);
export type ResetPasswordValues = z.input<typeof resetPasswordSchema>;

export function toResetBody(values: z.output<typeof resetPasswordSchema>) {
  return {
    email: values.email,
    otp: values.otp,
    newPassword: values.password,
  } satisfies Schema<'ResetPasswordDto'>;
}
