import { describe, expect, it } from 'vitest';
import { defineNotificationLinks, mapNotificationLink } from './notification-links';

const ID = '0b5c7a00-0000-4000-8000-000000000001';

const MAP = defineNotificationLinks({
  '/orders/{orderId}': ({ orderId }) => `/account/orders/${orderId}`,
  '/me/reviews/{reviewId}': ({ reviewId }) => `/account/reviews?review=${reviewId}`,
  '/seller/reviews': () => '/reviews',
});

describe('mapNotificationLink (spec 00 §12.5)', () => {
  it('maps a pattern the app owns, with its parameters', () => {
    expect(mapNotificationLink(MAP, `/orders/${ID}`)).toBe(`/account/orders/${ID}`);
    expect(mapNotificationLink(MAP, `/me/reviews/${ID}`)).toBe(`/account/reviews?review=${ID}`);
    expect(mapNotificationLink(MAP, '/seller/reviews')).toBe('/reviews');
  });

  it('returns null for a missing link, another app’s link or an unknown pattern', () => {
    expect(mapNotificationLink(MAP, undefined)).toBeNull();
    expect(mapNotificationLink(MAP, null)).toBeNull();
    expect(mapNotificationLink(MAP, '')).toBeNull();
    expect(mapNotificationLink(MAP, `/agent/shipments/${ID}`)).toBeNull();
    expect(mapNotificationLink(MAP, `/orders/${ID}/items`)).toBeNull();
    expect(mapNotificationLink(MAP, '/orders')).toBeNull();
  });

  it.each([
    'https://evil.test/orders/1',
    '//evil.test/orders/1',
    '/orders/../admin',
    '/orders/%2F%2Fevil.test',
    `/orders/${ID}?next=//evil.test`,
    `/orders/${ID}#x`,
    '\\orders\\1',
    'orders/1',
    `/orders/${ID}/`,
  ])('refuses the malformed link %s', (link) => {
    expect(mapNotificationLink(MAP, link)).toBeNull();
  });

  it('never returns a path that leaves the origin, whatever the map builds', () => {
    const broken = defineNotificationLinks({ '/x/{id}': ({ id }) => `//evil.test/${id}` });
    expect(mapNotificationLink(broken, '/x/1')).toBeNull();
  });
});
