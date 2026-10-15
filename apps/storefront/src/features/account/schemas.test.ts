import { describe, expect, it } from 'vitest';
import { hasChanges, profilePatch, profileSchema, profileValues, type Profile } from './schemas';

const profile: Profile = {
  id: '01900000-0000-7000-8000-000000000001',
  email: 'mona@example.test',
  firstName: 'Mona',
  lastName: 'Adel',
  phone: '+201001234567',
  createdAt: '2026-10-01T10:00:00.000Z',
};

const parse = (values: Parameters<typeof profileSchema.parse>[0]) => profileSchema.parse(values);

describe('profile patch (spec 01 SF-15)', () => {
  it('starts from the profile, phone without the +20 prefix', () => {
    expect(profileValues(profile)).toEqual({ firstName: 'Mona', lastName: 'Adel', phone: '1001234567' });
  });

  it('nothing changed (spaces and a leading 0 are not changes) → null', () => {
    const values = { firstName: ' Mona ', lastName: 'Adel', phone: '01001234567' };
    expect(profilePatch(parse(values), profile)).toBeNull();
    expect(hasChanges(values, profile)).toBe(false);
  });

  it('only the changed fields are sent, normalised', () => {
    expect(
      profilePatch(parse({ firstName: 'Mona', lastName: ' Samir ', phone: '1101234567' }), profile),
    ).toEqual({
      lastName: 'Samir',
      phone: '+201101234567',
    });
  });

  it('an invalid value counts as a change, so Save shows the error', () => {
    expect(hasChanges({ firstName: '', lastName: 'Adel', phone: '1001234567' }, profile)).toBe(true);
  });
});
