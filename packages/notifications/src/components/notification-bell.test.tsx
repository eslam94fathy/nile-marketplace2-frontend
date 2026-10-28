// @vitest-environment jsdom
import { fixtureId, mockApi, notificationFactory } from '@nile/test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BELL_PAGE_SIZE, UNREAD_POLL_MS, unreadCountQuery } from '../api';
import { pushStorageKeys } from '../push';
import { api, fakePush, makeConfig, renderNotifications, setupMswServer } from '../test/harness';
import { NotificationBell } from './notification-bell';

/** The first render of a file also loads its modules: more time than the 1 s default on a busy machine. */
const FIRST_RENDER = { timeout: 5000 };

const server = setupMswServer();

function serve({ count = 2, items = [notificationFactory()] } = {}) {
  const reads: string[] = [];
  const listQueries: URLSearchParams[] = [];
  let readAll = 0;
  server.use(
    mockApi('get', '/me/notifications/unread-count', ({ reply }) => reply.ok({ count })),
    mockApi('get', '/me/notifications', ({ request, reply }) => {
      listQueries.push(new URL(request.url).searchParams);
      return reply.ok(items, { nextCursor: null, hasMore: false, limit: BELL_PAGE_SIZE });
    }),
    mockApi('post', '/me/notifications/{notificationId}/read', ({ params, reply }) => {
      reads.push(String(params.notificationId));
      return reply.noContent();
    }),
    mockApi('post', '/me/notifications/read-all', ({ reply }) => {
      readAll += 1;
      return reply.noContent();
    }),
  );
  return { reads, listQueries, readAll: () => readAll };
}

describe('NotificationBell (spec 00 §12.4)', () => {
  it('names the unread count; the badge shows 99+ above 99', async () => {
    serve({ count: 100 });
    renderNotifications(<NotificationBell />);

    const bell = await screen.findByRole('button', { name: 'Notifications, 100 unread' }, FIRST_RENDER);
    expect(bell.textContent).toContain('99+');
  });

  it('no unread: no badge, still named with the count', async () => {
    serve({ count: 0 });
    renderNotifications(<NotificationBell />);

    const bell = await screen.findByRole('button', { name: 'Notifications, 0 unread' });
    expect(bell.textContent).toBe('');
  });

  it('opens on the 10 newest; selecting one of this app marks it read and follows its mapped link', async () => {
    const orderId = fixtureId(0x9001);
    const item = notificationFactory({ link: `/orders/${orderId}` });
    const api = serve({ items: [item] });
    const { user } = renderNotifications(<NotificationBell />);

    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
    const link = await within(dialog).findByRole('link', { name: /Order accepted/ });

    expect(api.listQueries[0]?.get('limit')).toBe(String(BELL_PAGE_SIZE));
    expect(link.getAttribute('href')).toBe(`/account/orders/${orderId}`);
    expect(link.textContent).toContain('Unread:');

    await user.click(link);
    await waitFor(() => {
      expect(api.reads).toEqual([item.id]);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('another app’s or an unknown link is shown without a link; selecting it only marks it read', async () => {
    const item = notificationFactory({ link: '/admin/support/tickets/abc' });
    const api = serve({ items: [item] });
    const { user } = renderNotifications(<NotificationBell />);

    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('link', { name: /Order accepted/ })).toBeNull();

    await user.click(await within(dialog).findByRole('button', { name: /Order accepted/ }));
    await waitFor(() => {
      expect(api.reads).toEqual([item.id]);
    });
  });

  it('a read notification without a link is not interactive and selecting does nothing', async () => {
    serve({ items: [notificationFactory({ link: null, read: true })] });
    const { user } = renderNotifications(<NotificationBell />);

    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Order accepted');
    expect(within(dialog).queryByRole('button', { name: /Order accepted/ })).toBeNull();
  });

  it('"Mark all as read" calls read-all; disabled with nothing unread', async () => {
    const api = serve({ count: 3 });
    const { user } = renderNotifications(<NotificationBell />);

    await user.click(await screen.findByRole('button', { name: 'Notifications, 3 unread' }));
    await user.click(await screen.findByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => {
      expect(api.readAll()).toBe(1);
    });
  });

  it('shows the empty state, "See all" and the settings link', async () => {
    serve({ count: 0, items: [] });
    const { user } = renderNotifications(<NotificationBell />);

    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    const dialog = await screen.findByRole('dialog');

    expect(await within(dialog).findByText('No notifications yet.')).toBeDefined();
    expect(within(dialog).getByRole('button', { name: 'Mark all as read' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(within(dialog).getByRole('link', { name: 'See all' }).getAttribute('href')).toBe('/notifications');
    expect(within(dialog).getByRole('link', { name: 'Notification settings' }).getAttribute('href')).toBe(
      '/notifications/settings',
    );
  });

  it('a failed list shows the error with "Try again"', async () => {
    server.use(
      mockApi('get', '/me/notifications/unread-count', ({ reply }) => reply.ok({ count: 1 })),
      mockApi('get', '/me/notifications', ({ reply }) => reply.error(500, 'INTERNAL_ERROR')),
    );
    const { user } = renderNotifications(<NotificationBell />);

    await user.click(await screen.findByRole('button', { name: /Notifications/ }));

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeDefined();
  });

  it('the push card shows while push is off; dismissing it is remembered on this device', async () => {
    serve();
    const push = fakePush();
    const { user, unmount } = renderNotifications(
      <NotificationBell />,
      makeConfig({ pushEnvironment: push.env }),
    );

    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    expect(await screen.findByText('Get notified about your orders on this device')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText('Get notified about your orders on this device')).toBeNull();
    expect(push.storage.get(pushStorageKeys('storefront').cardDismissed)).toBe('1');
    unmount();

    renderNotifications(<NotificationBell />, makeConfig({ pushEnvironment: push.env }));
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await screen.findByRole('dialog');
    expect(screen.queryByText('Get notified about your orders on this device')).toBeNull();
  });

  it('no card without card text (agent) or when the browser can’t do push', async () => {
    serve();
    const { user } = renderNotifications(
      <NotificationBell />,
      makeConfig({ pushCardText: null, pushEnvironment: fakePush({ supported: false }).env }),
    );

    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await screen.findByRole('link', { name: /Order accepted/ });
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull();
  });
});

describe('unread count polling (design 02 §5.2)', () => {
  it('polls every 60 s only while no socket is connected', () => {
    expect(unreadCountQuery(api, 'storefront', true).refetchInterval).toBe(UNREAD_POLL_MS);
    expect(unreadCountQuery(api, 'storefront', false).refetchInterval).toBe(false);
  });
});
