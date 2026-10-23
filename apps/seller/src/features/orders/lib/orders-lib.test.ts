import { fixtureId, sellerOrderFactory } from '@nile/test-utils';
import { describe, expect, it } from 'vitest';
import { cancelsWholeOrder, isTerminal, openItemCount, openQuantity } from './order-math';
import { orderTab } from './tabs';

const line = (id: number, quantity: number, cancelledQuantity: number) => {
  const base = sellerOrderFactory().items[0];
  if (base === undefined) throw new Error('factory has no item');
  return { ...base, id: fixtureId(id), quantity, cancelledQuantity };
};

describe('order tabs (spec 02 SE-14)', () => {
  it('no or unknown tab is "To confirm" (decided 2026-10-15)', () => {
    expect(orderTab(null).key).toBe('to-confirm');
    expect(orderTab('nonsense').key).toBe('to-confirm');
  });

  it('work queues oldest first, history newest first; "All" has no status filter', () => {
    expect(orderTab('to-confirm')).toMatchObject({ statuses: ['placed'], sort: 'createdAt' });
    expect(orderTab('in-delivery')).toMatchObject({
      statuses: ['picked_up', 'out_for_delivery', 'delivery_failed'],
      sort: '-createdAt',
    });
    expect(orderTab('all')).toMatchObject({ statuses: null, sort: '-createdAt' });
  });
});

describe('order quantities', () => {
  const order = sellerOrderFactory({ items: [line(1, 3, 1), line(2, 2, 0)] });

  it('open quantity and the list item count (Σ open)', () => {
    expect(openQuantity(line(1, 3, 1))).toBe(2);
    expect(openItemCount(order)).toBe(4);
  });

  it('cancelling every open unit cancels the whole order [SPEC 09 UC-OR-5]', () => {
    expect(cancelsWholeOrder(order, fixtureId(1), 2)).toBe(false);
    const single = sellerOrderFactory({ items: [line(1, 3, 1), line(2, 2, 2)] });
    expect(cancelsWholeOrder(single, fixtureId(1), 1)).toBe(false);
    expect(cancelsWholeOrder(single, fixtureId(1), 2)).toBe(true);
  });

  it('final statuses stop the detail polling', () => {
    expect(isTerminal('delivered')).toBe(true);
    expect(isTerminal('returned_to_seller')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('returning_to_seller')).toBe(false);
    expect(isTerminal('delivery_failed')).toBe(false);
  });
});
