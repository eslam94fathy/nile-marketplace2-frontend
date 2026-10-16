// @vitest-environment jsdom
import { adminShipmentFactory, fixtureId, governorateFactory, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { DASHBOARD_QUEUES } from '../dashboard';
import { UnassignedShipmentsQueue } from './unassigned-shipments';

const server = setupMswServer();

beforeEach(() => {
  server.use(
    mockApi(
      'get',
      '/admin/governorates',
      ({ reply }) => reply.ok([governorateFactory({ id: fixtureId(9700), name: 'Giza' })]),
      { base: BFF_BASE },
    ),
  );
});

describe('dashboard: unassigned shipments (spec 03 AD-02, T-H9)', () => {
  it('second queue on the dashboard', () => {
    expect(DASHBOARD_QUEUES[1]).toBe(UnassignedShipmentsQueue);
  });

  it('5 oldest unassigned shipments linking to AD-13; "See all" to the Unassigned tab', async () => {
    const queries: URLSearchParams[] = [];
    const shipment = adminShipmentFactory();
    server.use(
      mockApi(
        'get',
        '/admin/shipments',
        ({ request, reply }) => {
          queries.push(new URL(request.url).searchParams);
          return reply.ok([shipment], { nextCursor: null, hasMore: false, limit: 5 });
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<UnassignedShipmentsQueue />);
    const card = await screen.findByRole('region', { name: 'Unassigned shipments' });
    const link = await within(card).findByRole('link', { name: `Order ${shipment.orderNumber}` });
    expect(link.getAttribute('href')).toBe(`/delivery/shipments/${shipment.id}`);
    expect(await within(card).findByText(/^pickup in Giza, /)).toBeDefined();
    expect(
      within(card).getByRole('link', { name: 'See all unassigned shipments' }).getAttribute('href'),
    ).toBe('/delivery/shipments');
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({
      limit: '5',
      sort: 'createdAt',
      'status[eq]': 'unassigned',
    });
  });
});
