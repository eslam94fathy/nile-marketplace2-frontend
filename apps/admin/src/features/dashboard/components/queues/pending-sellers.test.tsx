// @vitest-environment jsdom
import { adminSellerDetailFactory, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { Dashboard } from '../dashboard';

const server = setupMswServer();

describe('dashboard: sellers waiting for approval (spec 03 AD-02, T-H7)', () => {
  it('5 oldest pending sellers linking to AD-05; "See all" to the Pending tab; "More…" with more', async () => {
    const queries: URLSearchParams[] = [];
    const seller = adminSellerDetailFactory({ businessName: 'Nile Crafts' });
    server.use(
      mockApi(
        'get',
        '/admin/sellers',
        ({ request, reply }) => {
          queries.push(new URL(request.url).searchParams);
          return reply.ok([seller], { nextCursor: 'next', hasMore: true, limit: 5 });
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<Dashboard />);
    const card = await screen.findByRole('region', { name: 'Sellers waiting for approval' });
    expect((await within(card).findByRole('link', { name: 'Nile Crafts' })).getAttribute('href')).toBe(
      `/sellers/${seller.id}`,
    );
    expect(within(card).getByText('More…')).toBeDefined();
    expect(
      within(card).getByRole('link', { name: 'See all sellers waiting for approval' }).getAttribute('href'),
    ).toBe('/sellers');
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({
      limit: '5',
      sort: 'createdAt',
      'status[eq]': 'pending_approval',
    });
  });

  it('nothing pending: "Nothing waiting."', async () => {
    server.use(
      mockApi(
        'get',
        '/admin/sellers',
        ({ reply }) => reply.ok([], { nextCursor: null, hasMore: false, limit: 5 }),
        {
          base: BFF_BASE,
        },
      ),
    );
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Nothing waiting.')).toBeDefined();
  });
});
