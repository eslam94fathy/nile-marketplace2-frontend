// @vitest-environment jsdom
import { adminReturnFactory, adminTicketFactory, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { DASHBOARD_QUEUES } from '../dashboard';
import { ReturnsToDecideQueue } from './returns-to-decide';
import { TicketsWaitingQueue } from './tickets-waiting';

const server = setupMswServer();
const PAGE = { nextCursor: null, hasMore: false, limit: 5 };

describe('dashboard: R2 cards (spec 03 §7.3, T-M1)', () => {
  it('come after the five R1 queues', () => {
    expect(DASHBOARD_QUEUES.indexOf(TicketsWaitingQueue)).toBe(5);
    expect(DASHBOARD_QUEUES.indexOf(ReturnsToDecideQueue)).toBe(6);
  });

  it('tickets waiting longest: new and awaiting support, longest wait first → AD-29; "See all" → AD-28', async () => {
    const queries: URLSearchParams[] = [];
    const ticket = adminTicketFactory();
    server.use(
      mockApi(
        'get',
        '/admin/support/tickets',
        ({ request, reply }) => {
          queries.push(new URL(request.url).searchParams);
          return reply.ok([ticket], PAGE);
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<TicketsWaitingQueue />);
    const card = await screen.findByRole('region', { name: 'Tickets waiting longest' });
    expect((await within(card).findByRole('link', { name: ticket.subject })).getAttribute('href')).toBe(
      `/support/${ticket.id}`,
    );
    expect(within(card).getByText(/^Mona Ali, waiting since /)).toBeDefined();
    expect(within(card).getByRole('link', { name: 'See all tickets' }).getAttribute('href')).toBe('/support');
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({
      limit: '5',
      sort: 'awaitingAdminSince',
      'status[in]': 'open,awaiting_admin',
    });
  });

  it('returns to decide: escalated and disputed, oldest first → AD-33; "See all" → AD-32', async () => {
    const queries: URLSearchParams[] = [];
    const escalated = adminReturnFactory();
    const disputed = adminReturnFactory({ status: 'disputed' });
    server.use(
      mockApi(
        'get',
        '/admin/returns',
        ({ request, reply }) => {
          queries.push(new URL(request.url).searchParams);
          return reply.ok([escalated, disputed], PAGE);
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<ReturnsToDecideQueue />);
    const card = await screen.findByRole('region', { name: 'Returns to decide' });
    expect(
      (await within(card).findByRole('link', { name: escalated.returnNumber })).getAttribute('href'),
    ).toBe(`/returns/${escalated.id}`);
    expect(within(card).getByText(/^Escalated, /)).toBeDefined();
    expect(within(card).getByText(/^Disputed by seller, /)).toBeDefined();
    expect(within(card).getByRole('link', { name: 'See all returns' }).getAttribute('href')).toBe('/returns');
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({
      limit: '5',
      sort: 'createdAt',
      'status[in]': 'escalated,disputed',
    });
  });
});
