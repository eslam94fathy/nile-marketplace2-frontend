import { addressFactory } from '@nile/test-utils';
import { describe, expect, it } from 'vitest';
import { addressSchema, addressValues, toCreateAddressBody, toUpdateAddressBody } from './schemas';

describe('address bodies (spec 01 SF-16)', () => {
  const saved = addressFactory({ floor: '3', landmark: 'Near the mosque', isDefault: false });

  it('create: empty optional fields are left out', () => {
    const values = addressSchema.parse({ ...addressValues(saved), floor: '', apartment: ' ', landmark: '' });
    const body = toCreateAddressBody(values, true);
    expect(body).not.toHaveProperty('floor');
    expect(body).not.toHaveProperty('apartment');
    expect(body).not.toHaveProperty('landmark');
    expect(body.isDefault).toBe(true);
  });

  it('edit: unchanged values (spaces, leading 0) → nothing to send', () => {
    const values = addressValues(saved);
    expect(
      toUpdateAddressBody(
        addressSchema.parse({
          ...values,
          label: ` ${values.label} `,
          recipientPhone: `0${values.recipientPhone}`,
        }),
        saved,
      ),
    ).toBeNull();
  });

  it('edit: only changed fields; a cleared optional field is null', () => {
    const values = addressSchema.parse({
      ...addressValues(saved),
      street: 'Makram Ebeid',
      floor: '',
      apartment: '7',
    });
    expect(toUpdateAddressBody(values, saved)).toEqual({
      street: 'Makram Ebeid',
      floor: null,
      apartment: '7',
    });
  });

  it('edit: isDefault is only sent to make this the default, never to unset it', () => {
    const makeDefault = addressSchema.parse({ ...addressValues(saved), isDefault: true });
    expect(toUpdateAddressBody(makeDefault, saved)).toEqual({ isDefault: true });
    const theDefault = { ...saved, isDefault: true };
    const unset = addressSchema.parse({ ...addressValues(theDefault), isDefault: false });
    expect(toUpdateAddressBody(unset, theDefault)).toBeNull();
  });
});
