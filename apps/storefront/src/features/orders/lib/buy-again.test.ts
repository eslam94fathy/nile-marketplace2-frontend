import { ApiError } from '@nile/api';
import { describe, expect, it, vi } from 'vitest';
import { runBuyAgain, type BuyAgainItem } from './buy-again';

const item = (n: number): BuyAgainItem => ({
  id: `i${n}`,
  variantId: `v${n}`,
  productName: `P${n}`,
  quantity: n,
});
const refused = (code: 'INSUFFICIENT_STOCK' | 'CART_LINE_LIMIT_REACHED' | 'NOT_A_KNOWN_CODE') =>
  new ApiError(409, code, 'x');
const ambiguous = (error: unknown) => !(error instanceof ApiError) || error.status >= 500;

describe('runBuyAgain (spec 01 SF-18-A3)', () => {
  it('adds one at a time, in order, and reports every outcome', async () => {
    const order: string[] = [];
    let running = 0;
    const add = vi.fn(async (i: BuyAgainItem) => {
      running += 1;
      expect(running).toBe(1);
      order.push(i.variantId);
      await Promise.resolve();
      running -= 1;
      if (i.id === 'i2') throw refused('INSUFFICIENT_STOCK');
      if (i.id === 'i3') throw refused('NOT_A_KNOWN_CODE');
    });
    const result = await runBuyAgain([item(1), item(2), item(3)], add, ambiguous);
    expect(order).toEqual(['v1', 'v2', 'v3']);
    expect(result.items.map((r) => r.outcome)).toEqual(['added', 'INSUFFICIENT_STOCK', 'failed']);
    expect(result.interrupted).toBe(false);
  });

  it('a full cart skips the remaining items', async () => {
    const add = vi.fn((i: BuyAgainItem) =>
      i.id === 'i1' ? Promise.reject(refused('CART_LINE_LIMIT_REACHED')) : Promise.resolve(),
    );
    const result = await runBuyAgain([item(1), item(2)], add, ambiguous);
    expect(result.items.map((r) => r.outcome)).toEqual(['CART_LINE_LIMIT_REACHED', 'skipped']);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('an ambiguous failure stops the run, never retried', async () => {
    const add = vi.fn((i: BuyAgainItem) =>
      i.id === 'i2' ? Promise.reject(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x')) : Promise.resolve(),
    );
    const result = await runBuyAgain([item(1), item(2), item(3)], add, ambiguous);
    expect(result.interrupted).toBe(true);
    expect(result.items.map((r) => r.outcome)).toEqual(['added']);
    expect(add).toHaveBeenCalledTimes(2);
  });
});
