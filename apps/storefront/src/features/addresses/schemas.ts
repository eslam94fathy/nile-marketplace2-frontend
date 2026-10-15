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
