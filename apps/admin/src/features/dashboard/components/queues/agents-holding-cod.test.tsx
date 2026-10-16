// @vitest-environment jsdom
import { financeAccountFactory, fixtureId, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { DASHBOARD_QUEUES } from '../dashboard';
import { AgentsHoldingCodQueue } from './agents-holding-cod';

const server = setupMswServer();

describe('dashboard: agents holding COD cash (spec 03 AD-02, T-H11)', () => {
  it('the fourth of five queues', () => {
    expect(DASHBOARD_QUEUES).toHaveLength(5);
    expect(DASHBOARD_QUEUES[3]).toBe(AgentsHoldingCodQueue);
  });

  it('most cash first, each agent → AD-20 prefilled; "See all" → AD-18 non-zero COD cash', async () => {
    const queries: URLSearchParams[] = [];
    const account = financeAccountFactory({
      accountType: 'agent_cod_cash',
      ownerId: fixtureId(10001),
      ownerName: 'Sam Nabil',
      balance: '300.00',
    });
    server.use(
      mockApi(
        'get',
        '/admin/finance/accounts',
        ({ request, reply }) => {
          queries.push(new URL(request.url).searchParams);
          return reply.ok([account], { nextCursor: null, hasMore: false, limit: 5 });
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<AgentsHoldingCodQueue />);
    const card = await screen.findByRole('region', { name: 'Agents holding COD cash' });
    expect((await within(card).findByRole('link', { name: 'Sam Nabil' })).getAttribute('href')).toBe(
      `/finance/remittances?agent=${fixtureId(10001)}`,
    );
    expect(within(card).getByText(/^EGP\s?300\.00$/)).toBeDefined();
    expect(
      within(card).getByRole('link', { name: 'See all agents holding COD cash' }).getAttribute('href'),
    ).toBe('/finance/accounts?type=agent_cod_cash&nonzero=1');
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({
      limit: '5',
      sort: '-balance',
      'accountType[eq]': 'agent_cod_cash',
      'balance[gt]': '0',
    });
  });
});
