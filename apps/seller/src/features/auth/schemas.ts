import type { Schema } from '@nile/api';
import { confirmationMatches } from '@nile/auth-screens';
import { fields } from '@nile/domain';
import { z } from 'zod';

// Seller registration (spec 02 SE-02), mirroring `RegisterSellerDto` and `PickupAddressInput`. Passwords are
// never trimmed; the email is trimmed and lower-cased; the phone becomes E.164.

export const registerSellerSchema = z
  .object({
    businessName: fields.trimmedString(2, 150),
    contactPhone: fields.egPhone,
    email: fields.email,
    password: fields.password,
    confirmPassword: z.string(),
    governorateId: z.string().min(1, fields.FIELD_MESSAGES.required),
    city: fields.trimmedString(1, 100),
    area: fields.trimmedString(1, 100),
    street: fields.trimmedString(1, 200),
    building: fields.trimmedString(1, 50),
    landmark: fields.nullableTrimmedString(1, 200),
  })
  .refine(confirmationMatches.check, confirmationMatches.issue);
export type RegisterSellerValues = z.input<typeof registerSellerSchema>;

/** Exactly the documented fields; an empty landmark is omitted on create (conventions §5). */
export function toRegisterSellerBody(values: z.output<typeof registerSellerSchema>) {
  return {
    email: values.email,
    password: values.password,
    businessName: values.businessName,
    contactPhone: values.contactPhone,
    pickupAddress: {
      governorateId: values.governorateId,
      city: values.city,
      area: values.area,
      street: values.street,
      building: values.building,
      ...(values.landmark === null ? {} : { landmark: values.landmark }),
    },
  } satisfies Schema<'RegisterSellerDto'>;
}
