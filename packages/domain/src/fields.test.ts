import { describe, expect, it } from 'vitest';
import type * as z from 'zod';
import {
  currentPassword,
  email,
  egPhone,
  FIELD_MESSAGES,
  money,
  nullableTrimmedString,
  otp,
  password,
  positiveMoney,
  slug,
  toLocalPhone,
  trimmedString,
} from './fields';
import { percentRate } from './rate-field';

// Samples mirror the backend rules in `src/lib/http/validation/{validators,fields}.ts` (backend 4ad89a6).

function firstMessage(schema: z.ZodType, value: unknown): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe('email', () => {
  it('trims and lower-cases', () => {
    expect(email.parse('  Jane.Doe@Example.COM ')).toBe('jane.doe@example.com');
  });

  it('accepts exactly 254 characters and rejects 255', () => {
    const at254 = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(58)}.eg`;
    expect(at254).toHaveLength(254);
    expect(email.safeParse(at254).success).toBe(true);
    expect(firstMessage(email, `x${at254}`)).toBe(FIELD_MESSAGES.emailTooLong);
  });

  it.each(['', '   ', 'jane', 'jane@', '@example.com', 'jane doe@example.com'])('rejects %j', (value) => {
    expect(email.safeParse(value).success).toBe(false);
  });
});

describe('password (new)', () => {
  it('accepts 8 characters and never trims', () => {
    expect(password.parse(' 1234567')).toBe(' 1234567');
    expect(password.parse('pass word ')).toBe('pass word ');
  });

  it('rejects 7 characters', () => {
    expect(firstMessage(password, '1234567')).toBe(FIELD_MESSAGES.passwordTooShort);
  });

  it('counts UTF-8 bytes, not characters: 72 bytes pass, 73 fail', () => {
    // "é" is 2 bytes in UTF-8.
    expect(password.safeParse('é'.repeat(36)).success).toBe(true);
    expect(firstMessage(password, `${'é'.repeat(36)}a`)).toBe('Password is too long');
    // 4-byte emoji: 18 × 4 = 72 bytes but only 36 UTF-16 units.
    expect(password.safeParse('😀'.repeat(18)).success).toBe(true);
    expect(password.safeParse('😀'.repeat(19)).success).toBe(false);
  });
});

describe('currentPassword', () => {
  it('accepts any non-empty password up to 72 bytes, untrimmed', () => {
    expect(currentPassword.parse(' x ')).toBe(' x ');
    expect(currentPassword.safeParse('a'.repeat(72)).success).toBe(true);
  });

  it('rejects empty and 73 bytes', () => {
    expect(firstMessage(currentPassword, '')).toBe(FIELD_MESSAGES.required);
    expect(firstMessage(currentPassword, 'a'.repeat(73))).toBe('Password is too long');
  });
});

describe('egPhone', () => {
  it.each([
    ['1012345678', '+201012345678'],
    ['01012345678', '+201012345678'],
    ['1112345678', '+201112345678'],
    ['1212345678', '+201212345678'],
    [' 1512345678 ', '+201512345678'],
  ])('%j → %s', (input, e164) => {
    expect(egPhone.parse(input)).toBe(e164);
  });

  it.each(['1312345678', '01312345678', '101234567', '10123456789', '+201012345678', '10-1234-5678', ''])(
    'rejects %j',
    (input) => {
      expect(firstMessage(egPhone, input)).toBe(FIELD_MESSAGES.egPhone);
    },
  );

  it('turns an API number back into the local digits', () => {
    expect(toLocalPhone('+201012345678')).toBe('1012345678');
    expect(toLocalPhone('+2013')).toBe('+2013');
  });
});

describe('otp', () => {
  it('accepts 6 digits and trims a pasted code', () => {
    expect(otp.parse(' 012345 ')).toBe('012345');
  });

  it.each(['12345', '1234567', '12a456', '١٢٣٤٥٦'])('rejects %j', (value) => {
    expect(firstMessage(otp, value)).toBe(FIELD_MESSAGES.otp);
  });
});

describe('money and positiveMoney', () => {
  it.each(['0', '0.00', '150', '150.5', '150.00', '1234567890.12'])('money accepts %s', (value) => {
    expect(money.parse(value)).toBe(value);
  });

  it.each(['12345678901.00', '1.001', '-1.00', '1,000', '.50', '1.', ''])('money rejects %j', (value) => {
    expect(firstMessage(money, value)).toBe(FIELD_MESSAGES.money);
  });

  it.each(['0.01', '1', '1234567890.12'])('positiveMoney accepts %s', (value) => {
    expect(positiveMoney.parse(value)).toBe(value);
  });

  it.each(['0', '0.0', '0.00', '00.00', '-1'])('positiveMoney rejects %j', (value) => {
    expect(firstMessage(positiveMoney, value)).toBe(FIELD_MESSAGES.positiveMoney);
  });
});

describe('slug', () => {
  const schema = slug(1, 20);

  it.each(['a', 'shoes', 'mens-shoes-2'])('accepts %s', (value) => {
    expect(schema.parse(value)).toBe(value);
  });

  it.each(['Shoes', 'mens--shoes', '-shoes', 'shoes-', 'mens shoes', 'shoes_2'])('rejects %j', (value) => {
    expect(firstMessage(schema, value)).toBe(FIELD_MESSAGES.slug);
  });

  it('applies the length range', () => {
    expect(firstMessage(schema, '')).toBe(FIELD_MESSAGES.tooShort(1));
    expect(firstMessage(schema, 'a'.repeat(21))).toBe(FIELD_MESSAGES.tooLong(20));
  });
});

describe('trimmedString', () => {
  const schema = trimmedString(1, 5);

  it('trims before checking the length', () => {
    expect(schema.parse('  abcde  ')).toBe('abcde');
  });

  it('treats blank as missing', () => {
    expect(firstMessage(schema, '   ')).toBe(FIELD_MESSAGES.required);
  });

  it('rejects too long and too short', () => {
    expect(firstMessage(schema, 'abcdef')).toBe(FIELD_MESSAGES.tooLong(5));
    expect(firstMessage(trimmedString(3, 5), 'ab')).toBe(FIELD_MESSAGES.tooShort(3));
  });
});

describe('nullableTrimmedString', () => {
  const schema = nullableTrimmedString(1, 5);

  it('turns empty or blank into null', () => {
    expect(schema.parse('')).toBeNull();
    expect(schema.parse('   ')).toBeNull();
  });

  it('trims and checks a value', () => {
    expect(schema.parse(' ab ')).toBe('ab');
    expect(firstMessage(schema, 'abcdef')).toBe(FIELD_MESSAGES.tooLong(5));
  });
});

describe('percentRate (spec 03 AD-Q-6)', () => {
  it.each([
    ['12.5', '0.1250'],
    [' 10 ', '0.1000'],
    ['0', '0.0000'],
    ['100', '1.0000'],
    ['5.25', '0.0525'],
  ])('%j → %s', (input, rate) => {
    expect(percentRate.parse(input)).toBe(rate);
  });

  it.each(['100.01', '101', '-1', '12.345', '', 'abc'])('rejects %j', (input) => {
    expect(percentRate.safeParse(input).success).toBe(false);
  });
});
