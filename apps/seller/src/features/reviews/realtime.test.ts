import { describe, expect, it } from 'vitest';
import { reviewKeys } from './api';
import { reviewKeysForNotification } from './realtime';

const notification = (link: string | null) => ({
  notificationId: 'n-1',
  category: 'orders',
  title: 'New review',
  body: 'One of your products has a new review.',
  link,
});

describe('a new review notification refreshes the review lists (design 02 §5.2)', () => {
  it('only for the reviews link [SPEC 13 NO-32]', () => {
    expect(reviewKeysForNotification(notification('/seller/reviews'))).toEqual([reviewKeys.lists()]);
    expect(reviewKeysForNotification(notification('/seller/orders/x'))).toEqual([]);
    expect(reviewKeysForNotification(notification(null))).toEqual([]);
  });
});
