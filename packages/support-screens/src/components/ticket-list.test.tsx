// @vitest-environment jsdom
import { mockApi, ticketFactory } from '@nile/test-utils';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderSupport, setupMswServer } from '../test/harness';
import { TicketList } from './ticket-list';

/** The first render of a file also loads its modules: more time than the 1 s default on a busy machine. */
const FIRST_RENDER = { timeout: 5000 };
const PAGE = { nextCursor: null, hasMore: false, limit: 20 };

const server = setupMswServer();

describe('TicketList (spec 01 SF-29)', () => {
  it('open tab: the API filter, rows with number, category, order, status, unread text', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      mockApi('get', '/support/tickets', ({ request, reply }) => {
        queries.push(new URL(request.url).searchParams);
        return reply.ok(
          [
            ticketFactory({
              subject: 'Parcel late',
              ticketNumber: 'T-000000042',
              status: 'awaiting_user',
              hasUnread: true,
              order: { id: 'o-1', orderNumber: '2026-000123' },
            }),
            ticketFactory({ subject: 'Card refund', category: 'payment' }),
          ],
          PAGE,
        );
      }),
    );
    renderSupport(<TicketList tab="open" />);

    const link = await screen.findByRole('link', { name: 'Parcel late' }, FIRST_RENDER);
    expect(link.getAttribute('href')).toMatch(/^\/support\//);
    expect(queries[0]?.get('status[in]')).toBe('open,awaiting_admin,awaiting_user,resolved');
    expect(queries[0]?.get('sort')).toBe('-lastMessageAt');

    const row = link.closest('article');
    if (row === null) throw new Error('row');
    expect(within(row).getByText(/Ticket T-000000042 · Order · Order 2026-000123/)).toBeDefined();
    expect(within(row).getByText('Support replied')).toBeDefined();
    expect(within(row).getByText('New reply')).toBeDefined();

    const other = screen.getByRole('link', { name: 'Card refund' }).closest('article');
    if (other === null) throw new Error('row');
    expect(within(other).queryByText('New reply')).toBeNull();

    expect(screen.getByRole('link', { name: 'New ticket' }).getAttribute('href')).toBe('/support/new');
    const tabs = screen.getByRole('navigation', { name: 'Tickets' });
    expect(within(tabs).getByRole('link', { name: 'Open' }).getAttribute('aria-current')).toBe('page');
    expect(within(tabs).getByRole('link', { name: 'Closed' }).getAttribute('href')).toBe(
      '/support?status=closed',
    );
  });

  it('empty: the open tab invites the first ticket; the closed tab says none', async () => {
    server.use(mockApi('get', '/support/tickets', ({ reply }) => reply.ok([], PAGE)));
    const view = renderSupport(<TicketList tab="open" />);
    expect(
      await screen.findByText("You haven't contacted support yet.", undefined, FIRST_RENDER),
    ).toBeDefined();
    view.unmount();

    const queries: URLSearchParams[] = [];
    server.use(
      mockApi('get', '/support/tickets', ({ request, reply }) => {
        queries.push(new URL(request.url).searchParams);
        return reply.ok([], PAGE);
      }),
    );
    renderSupport(<TicketList tab="closed" />);
    expect(await screen.findByText('You have no closed tickets.')).toBeDefined();
    expect(queries[0]?.get('status[in]')).toBe('closed');
  });

  it('a failed read offers a retry', async () => {
    server.use(mockApi('get', '/support/tickets', ({ reply }) => reply.error(500, 'INTERNAL_ERROR')));
    renderSupport(<TicketList tab="open" />);
    expect(
      await screen.findByText("Your tickets couldn't be loaded.", undefined, FIRST_RENDER),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeDefined();
  });
});
