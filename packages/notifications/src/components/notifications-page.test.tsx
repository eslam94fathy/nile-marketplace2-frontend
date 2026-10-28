// @vitest-environment jsdom
import { mockApi, notificationFactory } from '@nile/test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ALL_NOTIFICATIONS, NOTIFICATIONS_PAGE_SIZE } from '../api';
import { renderNotifications, setupMswServer } from '../test/harness';
import { NotificationsPage } from './notifications-page';

/** The first render of a file also loads its modules: more time than the 1 s default on a busy machine. */
const FIRST_RENDER = { timeout: 5000 };

const server = setupMswServer();

describe('NotificationsPage (spec 00 §12.4)', () => {
  it('sends the filter as API keys and shows the filter as the current chips', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      mockApi('get', '/me/notifications', ({ request, reply }) => {
        queries.push(new URL(request.url).searchParams);
        return reply.ok([notificationFactory()], { nextCursor: null, hasMore: false, limit: 20 });
      }),
    );
    renderNotifications(<NotificationsPage filter={{ unreadOnly: true, category: 'shipments' }} />);

    await screen.findByRole('link', { name: /Order accepted/ }, FIRST_RENDER);
    const query = queries[0];
    expect(query?.get('read[eq]')).toBe('false');
    expect(query?.get('category[eq]')).toBe('shipments');
    expect(query?.get('limit')).toBe(String(NOTIFICATIONS_PAGE_SIZE));
    expect(query?.get('sort')).toBe('-createdAt');

    const show = screen.getByRole('list', { name: 'Show' });
    expect(within(show).getByRole('link', { name: 'Unread' }).getAttribute('aria-current')).toBe('true');
    expect(within(show).getByRole('link', { name: 'All' }).getAttribute('href')).toBe(
      '/notifications?category=shipments',
    );
    const categories = screen.getByRole('list', { name: 'Category' });
    expect(within(categories).getByRole('link', { name: 'Deliveries' }).getAttribute('aria-current')).toBe(
      'true',
    );
    expect(within(categories).getByRole('link', { name: 'Offers' }).getAttribute('href')).toBe(
      '/notifications?show=unread&category=promotions',
    );
  });

  it('the default filter sends neither key; "Load more" follows the cursor', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      mockApi('get', '/me/notifications', ({ request, reply }) => {
        const query = new URL(request.url).searchParams;
        queries.push(query);
        return query.get('cursor') === 'c2'
          ? reply.ok([notificationFactory({ title: 'Second page' })], {
              nextCursor: null,
              hasMore: false,
              limit: 20,
            })
          : reply.ok([notificationFactory()], { nextCursor: 'c2', hasMore: true, limit: 20 });
      }),
    );
    const { user } = renderNotifications(<NotificationsPage filter={ALL_NOTIFICATIONS} />);

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Second page')).toBeDefined();
    expect(queries[0]?.has('read[eq]')).toBe(false);
    expect(queries[0]?.has('category[eq]')).toBe(false);
    expect(queries[1]?.get('cursor')).toBe('c2');
  });

  it('empty with the unread filter says so', async () => {
    server.use(
      mockApi('get', '/me/notifications', ({ reply }) =>
        reply.ok([], { nextCursor: null, hasMore: false, limit: 20 }),
      ),
    );
    renderNotifications(<NotificationsPage filter={{ unreadOnly: true, category: null }} />);

    expect(await screen.findByText('No unread notifications.')).toBeDefined();
  });

  it('a failed list shows the error; "Mark all as read" refetches the list', async () => {
    let calls = 0;
    server.use(
      mockApi('get', '/me/notifications', ({ reply }) => {
        calls += 1;
        return calls === 1
          ? reply.error(503, 'SERVICE_UNAVAILABLE')
          : reply.ok([notificationFactory({ read: true })], { nextCursor: null, hasMore: false, limit: 20 });
      }),
      mockApi('post', '/me/notifications/read-all', ({ reply }) => reply.noContent()),
    );
    const { user } = renderNotifications(<NotificationsPage filter={ALL_NOTIFICATIONS} />);

    expect(await screen.findByRole('alert')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => {
      expect(calls).toBe(2);
    });
    expect(await screen.findByText('Order accepted')).toBeDefined();
  });

  it('a failed "Mark all as read" says so in a toast', async () => {
    server.use(
      mockApi('get', '/me/notifications', ({ reply }) =>
        reply.ok([notificationFactory()], { nextCursor: null, hasMore: false, limit: 20 }),
      ),
      mockApi('post', '/me/notifications/read-all', ({ reply }) => reply.error(500, 'INTERNAL_ERROR')),
    );
    const { Toaster } = await import('@nile/ui');
    const { user } = renderNotifications(
      <>
        <NotificationsPage filter={ALL_NOTIFICATIONS} />
        <Toaster />
      </>,
    );

    await user.click(await screen.findByRole('button', { name: 'Mark all as read' }));

    expect(await screen.findByText('Notifications couldn’t be marked as read. Try again.')).toBeDefined();
  });
});
