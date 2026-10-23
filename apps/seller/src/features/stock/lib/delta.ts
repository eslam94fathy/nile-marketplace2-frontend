import { z } from 'zod';
import type { StockLevel } from '../api';

// SE-12 arithmetic on whole units (stock counts are integers, not money). The backend accepts a delta when
// `onHand + delta >= reserved` and `>= 0`, with |delta| ≤ 100000 and delta ≠ 0 [SPEC 06 UC-CA-5, §4.3].

export const STOCK_QUANTITY_MAX = 100_000;

export type AdjustMode = 'add' | 'remove' | 'set';

export interface AdjustInput {
  readonly mode: AdjustMode;
  /** The typed number: a quantity for add/remove, the counted on-hand target for "set". */
  readonly amount: number;
}

/** The delta the form will send, computed from the stock read when the dialog opened. */
export function adjustmentDelta(input: AdjustInput, stock: StockLevel): number {
  switch (input.mode) {
    case 'add':
      return input.amount;
    case 'remove':
      return -input.amount;
    case 'set':
      return input.amount - stock.onHand;
  }
}

export type DeltaProblem = 'none' | 'tooLarge' | 'belowReserved';

/** Why the backend would refuse this delta, checked before sending. */
export function deltaProblem(delta: number, stock: StockLevel): DeltaProblem | null {
  if (delta === 0) return 'none';
  if (Math.abs(delta) > STOCK_QUANTITY_MAX) return 'tooLarge';
  // `sellable = onHand − reserved`: the most that can be removed.
  if (delta < 0 && -delta > stock.sellable) return 'belowReserved';
  return null;
}

/** Whole number in 0..100000 (or 1..100000 for add/remove), from what was typed; null otherwise. */
export function parseAmount(text: string, mode: AdjustMode): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  const min = mode === 'set' ? 0 : 1;
  return value >= min && value <= STOCK_QUANTITY_MAX ? value : null;
}

/** The adjustment form: mode and the typed amount, refused unless it gives a delta the API accepts. */
export function adjustSchema(stock: StockLevel, messages: AdjustMessages) {
  return z.object({ mode: z.enum(['add', 'remove', 'set']), amount: z.string() }).transform((values, ctx) => {
    const amount = parseAmount(values.amount, values.mode);
    if (amount === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: messages.wholeNumber(values.mode === 'set' ? 0 : 1),
      });
      return z.NEVER;
    }
    const delta = adjustmentDelta({ mode: values.mode, amount }, stock);
    const problem = deltaProblem(delta, stock);
    if (problem !== null) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: messages.problem(problem, stock) });
      return z.NEVER;
    }
    return { delta };
  });
}

export interface AdjustMessages {
  readonly wholeNumber: (min: number) => string;
  readonly problem: (problem: DeltaProblem, stock: StockLevel) => string;
}
