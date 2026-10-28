import { describe, expect, it } from 'vitest';
import { notificationOpenPath } from './notification-links';

describe('agent notification links (spec 00 §12.5)', () => {
  it.each([
    [
      '/agent/shipments/0b5c7a00-0000-4000-8000-000000000001',
      '/shipments/0b5c7a00-0000-4000-8000-000000000001',
    ],
  ])('%s → %s', (link, path) => {
    expect(notificationOpenPath(link)).toBe(path);
  });

  it.each([
    '/orders/0b5c7a00-0000-4000-8000-000000000001',
    '/seller/orders/0b5c7a00-0000-4000-8000-000000000001',
    '/admin/support/tickets/0b5c7a00-0000-4000-8000-000000000001',
    '/support/tickets/0b5c7a00-0000-4000-8000-000000000001',
    '/somewhere/new',
    '//evil.test/orders/1',
  ])('%s is not this app’s: the notifications page', (link) => {
    expect(notificationOpenPath(link)).toBe('/notifications');
  });

  it('no link: the notifications page', () => {
    expect(notificationOpenPath(null)).toBe('/notifications');
  });
});
