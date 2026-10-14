import type { Schema } from '@nile/api';
import { confirmationMatches } from '@nile/auth-screens';
import { fields } from '@nile/domain';
import { z } from 'zod';

// Customer registration (spec 01 SF-11), from the shared field rules that mirror `RegisterCustomerDto`.
// Passwords are never trimmed; the email is trimmed and lower-cased; the phone becomes E.164.

const NAME_MAX = 100;

export const registerSchema = z
  .object({
    firstName: fields.trimmedString(1, NAME_MAX),
    lastName: fields.trimmedString(1, NAME_MAX),
    email: fields.email,
    phone: fields.egPhone,
    password: fields.password,
    confirmPassword: z.string(),
  })
  .refine(confirmationMatches.check, confirmationMatches.issue);
export type RegisterValues = z.input<typeof registerSchema>;

/** The request body: exactly the documented fields (CLAUDE.md §3), the confirmation stays in the UI. */
export function toRegisterBody(values: z.output<typeof registerSchema>) {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    phone: values.phone,
    password: values.password,
  } satisfies Schema<'RegisterCustomerDto'>;
}
