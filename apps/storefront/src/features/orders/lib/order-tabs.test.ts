import { describe, expect, it } from 'vitest';
import { orderTab } from './order-tabs';

describe('order tabs (spec 01 SF-17)', () => {
  it.each([
    [undefined, 'all', null],
    ['awaiting-payment', 'awaiting-payment', ['pending_payment']],
    ['in-progress', 'in-progress', ['placed', 'in_progress']],
    ['completed', 'completed', ['completed', 'partially_completed']],
    ['cancelled', 'cancelled', ['cancelled']],
    ['placed', 'all', null],
    ['', 'all', null],
  ])('%s → %s', (param, key, statuses) => {
    const tab = orderTab(param);
    expect(tab.key).toBe(key);
    expect(tab.statuses).toEqual(statuses);
  });
});
