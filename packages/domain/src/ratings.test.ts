import { describe, expect, it } from 'vitest';
import { formatRating, starFills } from './ratings';

describe('formatRating', () => {
  it('shows one decimal, rounded half up', () => {
    expect(formatRating('4.30')).toBe('4.3');
    expect(formatRating('4.25')).toBe('4.3');
    expect(formatRating('4.24')).toBe('4.2');
    expect(formatRating('5.00')).toBe('5.0');
    expect(formatRating('3')).toBe('3.0');
  });

  it('refuses anything that is not a rating string', () => {
    expect(() => formatRating('6.00')).toThrow(RangeError);
    expect(() => formatRating('4.333')).toThrow(RangeError);
    expect(() => formatRating('')).toThrow(RangeError);
  });
});

describe('starFills', () => {
  it('rounds to the nearest half star', () => {
    expect(starFills('4.30')).toEqual(['full', 'full', 'full', 'full', 'half']);
    expect(starFills('4.20')).toEqual(['full', 'full', 'full', 'full', 'empty']);
    expect(starFills('4.75')).toEqual(['full', 'full', 'full', 'full', 'full']);
    expect(starFills('1.00')).toEqual(['full', 'empty', 'empty', 'empty', 'empty']);
    expect(starFills('0.00')).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
  });
});
