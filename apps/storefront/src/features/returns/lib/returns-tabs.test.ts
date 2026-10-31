import { describe, expect, it } from 'vitest';
import { parseReturnsTab } from './returns-tabs';

describe('returns tabs (spec 01 SF-27)', () => {
  it.each([
    [undefined, 'open'],
    [null, 'open'],
    ['open', 'open'],
    ['closed', 'closed'],
    ['completed', 'open'],
    ['', 'open'],
  ])('%s → %s', (param, tab) => {
    expect(parseReturnsTab(param)).toBe(tab);
  });
});
