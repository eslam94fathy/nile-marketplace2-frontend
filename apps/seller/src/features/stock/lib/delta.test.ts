import { describe, expect, it } from 'vitest';
import { adjustmentDelta, adjustSchema, deltaProblem, parseAmount, type AdjustMessages } from './delta';

const STOCK = { onHand: 12, reserved: 4, sellable: 8 };

const MESSAGES: AdjustMessages = {
  wholeNumber: (min) => `whole ${min}`,
  problem: (problem) => problem,
};

describe('stock adjustment delta (spec 02 SE-12)', () => {
  it('add and remove are ± the quantity', () => {
    expect(adjustmentDelta({ mode: 'add', amount: 5 }, STOCK)).toBe(5);
    expect(adjustmentDelta({ mode: 'remove', amount: 3 }, STOCK)).toBe(-3);
  });

  it('"set to" is the target minus the on-hand count read when the dialog opened', () => {
    expect(adjustmentDelta({ mode: 'set', amount: 20 }, STOCK)).toBe(8);
    expect(adjustmentDelta({ mode: 'set', amount: 9 }, STOCK)).toBe(-3);
    expect(adjustmentDelta({ mode: 'set', amount: 12 }, STOCK)).toBe(0);
  });

  it('refuses what the backend would: no change, beyond 100000, below the reserved units', () => {
    expect(deltaProblem(0, STOCK)).toBe('none');
    expect(deltaProblem(100_001, STOCK)).toBe('tooLarge');
    expect(deltaProblem(-9, STOCK)).toBe('belowReserved');
    expect(deltaProblem(-8, STOCK)).toBeNull();
    expect(deltaProblem(100_000, STOCK)).toBeNull();
  });

  it('whole numbers only; at least 1 to add or remove, 0 allowed as a count', () => {
    expect(parseAmount(' 5 ', 'add')).toBe(5);
    expect(parseAmount('0', 'add')).toBeNull();
    expect(parseAmount('0', 'set')).toBe(0);
    for (const text of ['', '1.5', '-2', '1e3', '100001']) expect(parseAmount(text, 'set')).toBeNull();
  });

  it('the form schema gives the delta, or the reason on `amount`', () => {
    const schema = adjustSchema(STOCK, MESSAGES);
    expect(schema.parse({ mode: 'set', amount: '15' })).toEqual({ delta: 3 });
    const tooMuch = schema.safeParse({ mode: 'remove', amount: '9' });
    expect(tooMuch.error?.issues[0]).toMatchObject({ path: ['amount'], message: 'belowReserved' });
    expect(schema.safeParse({ mode: 'add', amount: 'x' }).error?.issues[0]?.message).toBe('whole 1');
    expect(schema.safeParse({ mode: 'set', amount: '12' }).error?.issues[0]?.message).toBe('none');
  });
});
