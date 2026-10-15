import { describe, expect, it } from 'vitest';
import { expectedTotal } from './expected-total';

describe('expectedTotal (spec 01 SF-07 §3, OQ-15)', () => {
  it.each([
    ['500.00', '45.00', '545.00'],
    ['0.10', '0.20', '0.30'],
    ['1234567.89', '0.11', '1234568.00'],
    ['99.9', '5', '104.90'],
    ['250.00', '0.00', '250.00'],
  ])('%s + %s = %s exactly', (items, fee, total) => {
    expect(expectedTotal(items, fee)).toBe(total);
  });

  it('is null until a delivery fee is known', () => {
    expect(expectedTotal('500.00', null)).toBeNull();
  });
});
