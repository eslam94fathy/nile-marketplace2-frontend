import type { Schema } from '@nile/api';
import { fields } from '@nile/domain';
import * as z from 'zod';

// SF-15 Profile form, from the shared field rules that mirror `UpdateCustomerProfileDto` (same as SF-11).

const NAME_MAX = 100;

export type Profile = Schema<'CustomerProfileDto'>;
export type ProfilePatch = Schema<'UpdateCustomerProfileDto'>;

export const profileSchema = z.object({
  firstName: fields.trimmedString(1, NAME_MAX),
  lastName: fields.trimmedString(1, NAME_MAX),
  phone: fields.egPhone,
});
export type ProfileValues = z.input<typeof profileSchema>;

/** The form's starting values: the profile as the API returned it (phone shown after the `+20` prefix). */
export function profileValues(profile: Profile): ProfileValues {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: fields.toLocalPhone(profile.phone),
  };
}

/**
 * `PATCH /me` sends only the fields that differ from the profile (spec 01 SF-15), compared after the same
 * normalisation the backend applies (trimmed names, E.164 phone). Null when nothing changed: the API refuses
 * an empty body.
 */
export function profilePatch(values: z.output<typeof profileSchema>, profile: Profile): ProfilePatch | null {
  const patch: ProfilePatch = {
    ...(values.firstName === profile.firstName ? {} : { firstName: values.firstName }),
    ...(values.lastName === profile.lastName ? {} : { lastName: values.lastName }),
    ...(values.phone === profile.phone ? {} : { phone: values.phone }),
  };
  return Object.keys(patch).length === 0 ? null : patch;
}

/**
 * Whether the inputs differ from the profile, for "Save" (disabled when nothing changed). A value that
 * doesn't parse counts as a change, so submitting shows its error.
 */
export function hasChanges(values: ProfileValues, profile: Profile): boolean {
  const parsed = profileSchema.safeParse(values);
  return !parsed.success || profilePatch(parsed.data, profile) !== null;
}
