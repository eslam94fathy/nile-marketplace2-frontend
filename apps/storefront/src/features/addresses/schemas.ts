import type { Schema } from '@nile/api';
import { fields } from '@nile/domain';
import { z } from 'zod';

// Address form (spec 01 SF-16, `CreateAddressDto`): required fields trimmed, phone as E.164, optional fields
// empty → omitted on create (conventions §5).

export const addressSchema = z.object({
  label: fields.trimmedString(1, 50),
  recipientName: fields.trimmedString(1, 100),
  recipientPhone: fields.egPhone,
  governorateId: z.string().min(1, fields.FIELD_MESSAGES.required),
  city: fields.trimmedString(1, 100),
  area: fields.trimmedString(1, 100),
  street: fields.trimmedString(1, 200),
  building: fields.trimmedString(1, 50),
  floor: fields.nullableTrimmedString(1, 10),
  apartment: fields.nullableTrimmedString(1, 10),
  landmark: fields.nullableTrimmedString(1, 200),
  isDefault: z.boolean(),
});
export type AddressValues = z.input<typeof addressSchema>;

export const EMPTY_ADDRESS: AddressValues = {
  label: '',
  recipientName: '',
  recipientPhone: '',
  governorateId: '',
  city: '',
  area: '',
  street: '',
  building: '',
  floor: '',
  apartment: '',
  landmark: '',
  isDefault: false,
};

/** The create body: exactly the documented fields; empty optional fields left out. */
export function toCreateAddressBody(values: z.output<typeof addressSchema>, makeDefault: boolean) {
  return {
    label: values.label,
    recipientName: values.recipientName,
    recipientPhone: values.recipientPhone,
    governorateId: values.governorateId,
    city: values.city,
    area: values.area,
    street: values.street,
    building: values.building,
    ...(values.floor === null ? {} : { floor: values.floor }),
    ...(values.apartment === null ? {} : { apartment: values.apartment }),
    ...(values.landmark === null ? {} : { landmark: values.landmark }),
    isDefault: makeDefault,
  } satisfies Schema<'CreateAddressDto'>;
}

/** The edit form's starting values: the address as saved (phone after `+20`, missing optional fields empty). */
export function addressValues(address: Schema<'AddressDto'>): AddressValues {
  return {
    label: address.label,
    recipientName: address.recipientName,
    recipientPhone: fields.toLocalPhone(address.recipientPhone),
    governorateId: address.governorateId,
    city: address.city,
    area: address.area,
    street: address.street,
    building: address.building,
    floor: address.floor ?? '',
    apartment: address.apartment ?? '',
    landmark: address.landmark ?? '',
    isDefault: address.isDefault,
  };
}

const EDITABLE = [
  'label',
  'recipientName',
  'recipientPhone',
  'governorateId',
  'city',
  'area',
  'street',
  'building',
  'floor',
  'apartment',
  'landmark',
] as const;

/**
 * The edit body (spec 01 SF-16): only the fields that differ from the saved address, compared after
 * normalisation; a cleared optional field is sent as `null`. `isDefault` is only ever sent as `true` (moving
 * the default here): unsetting it is refused [SPEC 04]. Null when nothing changed (no empty PATCH).
 */
export function toUpdateAddressBody(
  values: z.output<typeof addressSchema>,
  address: Schema<'AddressDto'>,
): Schema<'UpdateAddressDto'> | null {
  const body: Record<string, string | null | boolean> = {};
  for (const key of EDITABLE) {
    if (values[key] !== (address[key] ?? null)) body[key] = values[key];
  }
  if (values.isDefault && !address.isDefault) body.isDefault = true;
  return Object.keys(body).length === 0 ? null : body;
}

/** Whether the edit inputs differ from the saved address; a value that doesn't parse counts as a change. */
export function hasAddressChanges(values: AddressValues, address: Schema<'AddressDto'>): boolean {
  const parsed = addressSchema.safeParse(values);
  return !parsed.success || toUpdateAddressBody(parsed.data, address) !== null;
}
