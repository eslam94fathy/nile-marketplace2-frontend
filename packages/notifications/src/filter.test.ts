import { describe, expect, it } from 'vitest';
import { ALL_NOTIFICATIONS } from './api';
import { notificationsHref, parseNotificationFilter } from './filter';

describe('notification filter in the URL', () => {
  it('reads show and category; unknown or repeated values are dropped', () => {
    expect(parseNotificationFilter({ show: 'unread', category: 'support' })).toEqual({
      unreadOnly: true,
      category: 'support',
    });
    expect(parseNotificationFilter({})).toEqual(ALL_NOTIFICATIONS);
    expect(parseNotificationFilter({ show: 'everything', category: 'weather' })).toEqual(ALL_NOTIFICATIONS);
    expect(parseNotificationFilter({ show: ['unread', 'unread'], category: ['orders'] })).toEqual(
      ALL_NOTIFICATIONS,
    );
  });

  it('builds the page URL; the default filter is the bare path', () => {
    expect(notificationsHref('/notifications', ALL_NOTIFICATIONS)).toBe('/notifications');
    expect(notificationsHref('/account/notifications', { unreadOnly: true, category: 'promotions' })).toBe(
      '/account/notifications?show=unread&category=promotions',
    );
  });

  it('round-trips', () => {
    const filter = { unreadOnly: false, category: 'shipments' } as const;
    const query = Object.fromEntries(new URL(notificationsHref('/n', filter), 'http://x').searchParams);
    expect(parseNotificationFilter(query)).toEqual(filter);
  });
});
