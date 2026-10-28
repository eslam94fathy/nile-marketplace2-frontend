import { describe, expect, it } from 'vitest';
import { notificationOpenPath } from './notification-links';

const ID = '0b5c7a00-0000-4000-8000-000000000001';

describe('storefront notification links (spec 00 §12.5)', () => {
  it.each([
    [`/orders/${ID}`, `/account/orders/${ID}`],
    [`/returns/${ID}`, `/account/returns/${ID}`],
    [`/me/reviews/${ID}`, `/account/reviews?review=${ID}`],
    [`/support/tickets/${ID}`, `/account/support/${ID}`],
  ])('%s → %s', (link, path) => {
    expect(notificationOpenPath(link)).toBe(path);
  });

  it.each([
    `/seller/orders/${ID}`,
    `/admin/support/tickets/${ID}`,
    `/agent/shipments/${ID}`,
    '/somewhere/new',
    '//evil.test/orders/1',
  ])('%s is not this app’s: the notifications page', (link) => {
    expect(notificationOpenPath(link)).toBe('/account/notifications');
  });

  it('no link: the notifications page', () => {
    expect(notificationOpenPath(null)).toBe('/account/notifications');
  });
});
