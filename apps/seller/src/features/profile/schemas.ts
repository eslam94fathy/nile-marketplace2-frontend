import { fields } from '@nile/domain';
import { z } from 'zod';
import type { SellerProfile, SellerProfilePatch } from './api';

// SE-07-A1 Business details, mirroring `UpdateSellerProfileDto` and `PickupAddressInput` (same rules as SE-02).

export const profileSchema = z.object({
  businessName: fields.trimmedString(2, 150),
  contactPhone: fields.egPhone,
  governorateId: z.string().min(1, fields.FIELD_MESSAGES.required),
  city: fields.trimmedString(1, 100),
  area: fields.trimmedString(1, 100),
  street: fields.trimmedString(1, 200),
  building: fields.trimmedString(1, 50),
  landmark: fields.nullableTrimmedString(1, 200),
});
export type ProfileValues = z.input<typeof profileSchema>;
type ProfileOutput = z.output<typeof profileSchema>;

export const ADDRESS_FIELDS = ['governorateId', 'city', 'area', 'street', 'building', 'landmark'] as const;

/** The form's starting values: the profile as the API returned it (phone after the `+20` prefix). */
export function profileValues(profile: SellerProfile): ProfileValues {
  const address = profile.pickupAddress;
  return {
    businessName: profile.businessName,
    contactPhone: fields.toLocalPhone(profile.contactPhone),
    governorateId: address.governorateId,
    city: address.city,
    area: address.area,
    street: address.street,
    building: address.building,
    landmark: address.landmark ?? '',
  };
}

/**
 * `PATCH /seller/profile` with only the changed top-level fields, compared after the backend's normalisation.
 * The pickup address is replaced as a whole [SPEC 05], so any address change sends all of it, a cleared
 * landmark as `null` (spec 02 SE-07). Null when nothing changed: the API refuses an empty body.
 */
export function profilePatch(values: ProfileOutput, profile: SellerProfile): SellerProfilePatch | null {
  const address = profile.pickupAddress;
  const addressChanged = ADDRESS_FIELDS.some((name) => values[name] !== address[name]);
  const patch: SellerProfilePatch = {
    ...(values.businessName === profile.businessName ? {} : { businessName: values.businessName }),
    ...(values.contactPhone === profile.contactPhone ? {} : { contactPhone: values.contactPhone }),
    ...(addressChanged
      ? {
          pickupAddress: {
            governorateId: values.governorateId,
            city: values.city,
            area: values.area,
            street: values.street,
            building: values.building,
            landmark: values.landmark,
          },
        }
      : {}),
  };
  return Object.keys(patch).length === 0 ? null : patch;
}

/** Whether Save has anything to send. A value that doesn't parse counts as a change, so its error shows. */
export function hasChanges(values: ProfileValues, profile: SellerProfile): boolean {
  const parsed = profileSchema.safeParse(values);
  return !parsed.success || profilePatch(parsed.data, profile) !== null;
}
