import { describe, expect, it } from 'vitest';
import { addMoney, formatMoney, formatMoneyRange, parseMoney, percentToRate, rateToPercent } from './money';

// Intl may separate "EGP" and the amount with a no-break space; compare on plain spaces.
const plain = (value: string): string => value.replace(/\s/g, ' ');

describe('parseMoney', () => {
  it.each(['0', '150', '150.5', '150.00', '-5.00', '999999999999.99'])('accepts %s', (value) => {
    expect(parseMoney(value).toFixed(2)).toBe(Number(value).toFixed(2));
  });

  it.each(['', ' 1.00', '1.001', '1e3', '0x10', '1,000.00', '+1.00', 'NaN', '1234567890123.00'])(
    'rejects %j',
    (value) => {
      expect(() => parseMoney(value)).toThrow(RangeError);
    },
  );
});

describe('addMoney', () => {
  it('adds exactly: "0.10" + "0.20" = "0.30"', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30');
  });

  it('sums the checkout total (itemsTotal + deliveryFee) without float drift', () => {
    expect(addMoney('1234567890.12', '0.01')).toBe('1234567890.13');
    expect(addMoney('19.99', '30.00', '0.01')).toBe('50.00');
  });

  it('returns "0.00" for no values and handles negatives', () => {
    expect(addMoney()).toBe('0.00');
    expect(addMoney('10.00', '-2.50')).toBe('7.50');
  });

  it('rejects an invalid operand', () => {
    expect(() => addMoney('1.00', '1.005')).toThrow(RangeError);
  });
});

describe('formatMoney', () => {
  it('formats EGP with grouping and 2 decimals', () => {
    expect(plain(formatMoney('1250'))).toBe('EGP 1,250.00');
    expect(plain(formatMoney('0.5'))).toBe('EGP 0.50');
  });

  it('keeps every digit of the largest request amount', () => {
    expect(plain(formatMoney('1234567890.12'))).toBe('EGP 1,234,567,890.12');
  });

  it('keeps every digit beyond float precision', () => {
    expect(plain(formatMoney('999999999999.99'))).toBe('EGP 999,999,999,999.99');
  });

  it('formats negative balances', () => {
    expect(plain(formatMoney('-5.00'))).toBe('-EGP 5.00');
  });
});

describe('formatMoneyRange', () => {
  it('shows both ends when they differ', () => {
    expect(plain(formatMoneyRange('51.00', '71.00'))).toBe('EGP 51.00 – EGP 71.00');
  });

  it('shows one amount when min equals max, whatever the notation', () => {
    expect(plain(formatMoneyRange('51', '51.00'))).toBe('EGP 51.00');
  });
});

describe('rates and percents', () => {
  it.each([
    ['0.1000', '10.00'],
    ['0', '0.00'],
    ['1', '100.00'],
    ['1.0000', '100.00'],
    ['0.0525', '5.25'],
    ['0.0001', '0.01'],
  ])('rateToPercent(%s) = %s', (rate, percent) => {
    expect(rateToPercent(rate)).toBe(percent);
  });

  it.each(['1.0001', '0.12345', '-0.1', '10', ''])('rateToPercent rejects %j', (rate) => {
    expect(() => rateToPercent(rate)).toThrow(RangeError);
  });

  it.each([
    ['10', '0.1000'],
    ['10.5', '0.1050'],
    ['5.25', '0.0525'],
    ['0.01', '0.0001'],
    ['0', '0.0000'],
    ['100', '1.0000'],
  ])('percentToRate(%s) = %s', (percent, rate) => {
    expect(percentToRate(percent)).toBe(rate);
  });

  it.each(['100.01', '101', '5.255', '-1', '', '1e2'])('percentToRate rejects %j', (percent) => {
    expect(() => percentToRate(percent)).toThrow(RangeError);
  });

  it('round-trips every 2-decimal percent', () => {
    for (const percent of ['0.00', '0.01', '12.34', '99.99', '100.00']) {
      expect(rateToPercent(percentToRate(percent))).toBe(percent);
    }
  });
});
