// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { agentProfileFactory, agentShipmentFactory, fixtureId, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { renderWithNotifications } from '@/test/notifications';
import { ACTIVE_POLL_MS, activeShipmentsOptions } from '../api';
import { ActiveShipments } from './active-shipments';
import { History } from './history';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();
const PAGE = { nextCursor: null, hasMore: false, limit: 20 };

function serve(profile: Schema<'AgentProfileDto'>, rows: Schema<'AgentShipmentDto'>[]) {
  const queries: Record<string, string>[] = [];
  server.use(
    mockApi('get', '/agent/profile', ({ reply }) => reply.ok(profile), { base: BFF_BASE }),
    mockApi(
      'get',
      '/agent/shipments',
      ({ request, reply }) => {
        queries.push(Object.fromEntries(new URL(request.url).searchParams));
        return reply.ok(rows, PAGE);
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

describe('active shipments (spec 04 AG-04)', { timeout: 15_000 }, () => {
  it('shows the push card while push is possible and off; none when the browser can’t (AG-Q-8)', async () => {
    serve(agentProfileFactory(), []);
    const view = renderWithNotifications(<ActiveShipments tab={null} />, { supported: true });
    expect(await screen.findByText('Get notified when a new shipment is assigned to you.')).toBeDefined();
    view.unmount();

    serve(agentProfileFactory(), []);
    renderWithNotifications(<ActiveShipments tab={null} />);
    await screen.findByRole('heading', { name: 'Shipments' });
    expect(screen.queryByText('Get notified when a new shipment is assigned to you.')).toBeNull();
  });

  it('"To pick up" by default, oldest first; a card per shipment with what to collect', async () => {
    const queries = serve(agentProfileFactory(), [
      agentShipmentFactory(),
      agentShipmentFactory({ paymentMethod: 'kashier' }),
    ]);
    renderWithNotifications(<ActiveShipments tab={null} />);
    const [first, second, ...rest] = await screen.findAllByRole(
      'link',
      { name: /^Order / },
      { timeout: 5000 },
    );
    if (first === undefined || second === undefined) throw new Error('two cards expected');
    expect(rest).toHaveLength(0);
    // Both kinds: a return pickup waits here too, also after a failed pickup (AG-Q-7).
    expect(queries[0]).toEqual({ limit: '20', sort: 'createdAt', 'status[in]': 'assigned,pickup_failed' });
    expect(within(first).getByText(/^Collect EGP\s?300\.00$/)).toBeDefined();
    expect(within(second).getByText('Prepaid — collect nothing')).toBeDefined();
    expect(screen.getByRole('link', { name: 'To pick up' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'To deliver' }).getAttribute('href')).toBe('/?tab=deliver');
  });

  it('"To deliver": three statuses; a failed parcel shows its next attempt', async () => {
    const queries = serve(agentProfileFactory(), [
      agentShipmentFactory({ status: 'delivery_failed', attemptCount: 1 }),
    ]);
    renderWithNotifications(<ActiveShipments tab="deliver" />);
    expect(await screen.findByText('Attempt 2 of 3')).toBeDefined();
    expect(queries[0]).toMatchObject({
      'status[in]': 'picked_up,out_for_delivery,delivery_failed',
      'kind[eq]': 'delivery',
    });
  });

  it('empty tab text; off shift with nothing to finish says how to get work', async () => {
    serve(agentProfileFactory({ onShift: true }), []);
    const view = renderWithNotifications(<ActiveShipments tab="deliver" />);
    expect(await screen.findByText('Nothing to deliver.')).toBeDefined();
    view.unmount();
    serve(agentProfileFactory({ onShift: false, activeShipmentCount: 0 }), []);
    renderWithNotifications(<ActiveShipments tab={null} />);
    expect(await screen.findByText("You're off shift. Go on shift to get new shipments.")).toBeDefined();
  });

  it('a return pickup card: badge, collect from the customer, deliver to the seller, nothing to collect', async () => {
    serve(agentProfileFactory(), [
      agentShipmentFactory({
        kind: 'return',
        returnId: fixtureId(1),
        status: 'pickup_failed',
        attemptCount: 1,
      }),
    ]);
    renderWithNotifications(<ActiveShipments tab={null} />);
    const card = await screen.findByRole('link', { name: /^Order / }, { timeout: 5000 });
    expect(within(card).getByText('Return pickup')).toBeDefined();
    expect(within(card).getByText('Dokki, Giza, Giza')).toBeDefined();
    expect(within(card).getByText('Collect from:', { exact: false })).toBeDefined();
    expect(within(card).getByText('Nile Crafts, Zamalek, Cairo')).toBeDefined();
    expect(within(card).getByText('Nothing to collect')).toBeDefined();
    expect(within(card).getByText('Pickup attempt 2 of 3')).toBeDefined();
    expect(within(card).queryByText(/EGP/)).toBeNull();
  });

  it('"To the seller": failed deliveries and collected returns in two sections, two requests (TN1-Q1)', async () => {
    const queries = serve(agentProfileFactory(), []);
    renderWithNotifications(<ActiveShipments tab="seller" />);
    expect(await screen.findByRole('heading', { name: 'Failed deliveries' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Collected returns' })).toBeDefined();
    expect(await screen.findByText('No failed deliveries.')).toBeDefined();
    expect(await screen.findByText('No collected returns.')).toBeDefined();
    expect(queries).toEqual(
      expect.arrayContaining([
        { limit: '20', sort: 'createdAt', 'status[in]': 'returning_to_seller' },
        { limit: '20', sort: 'createdAt', 'status[in]': 'picked_up', 'kind[eq]': 'return' },
      ]),
    );
    expect(screen.getByRole('link', { name: 'To the seller' }).getAttribute('href')).toBe('/?tab=seller');
  });

  it('polls every 30 s (paused by TanStack while hidden)', () => {
    expect(activeShipmentsOptions('pickup', 0, false).refetchInterval).toBe(ACTIVE_POLL_MS);
    expect(activeShipmentsOptions('pickup', 0, true).refetchInterval).toBe(false);
    expect(ACTIVE_POLL_MS).toBe(30_000);
  });

  it('an inactive agent sees the message instead of the lists', async () => {
    const queries = serve(agentProfileFactory({ status: 'inactive' }), []);
    renderWithNotifications(<ActiveShipments tab={null} />);
    expect(await screen.findByText('Your account is inactive. Contact your admin.')).toBeDefined();
    expect(screen.queryByRole('navigation', { name: 'Shipment lists' })).toBeNull();
    expect(queries).toEqual([]);
  });

  it('AGENT_INACTIVE from a list reads the profile again', async () => {
    let profileReads = 0;
    let inactive = false;
    server.use(
      mockApi(
        'get',
        '/agent/profile',
        ({ reply }) => {
          profileReads += 1;
          return reply.ok(agentProfileFactory({ status: inactive ? 'inactive' : 'active' }));
        },
        { base: BFF_BASE },
      ),
      mockApi(
        'get',
        '/agent/shipments',
        ({ reply }) => {
          inactive = true;
          return reply.error(403, 'AGENT_INACTIVE');
        },
        { base: BFF_BASE },
      ),
    );
    renderWithNotifications(<ActiveShipments tab={null} />);
    expect(
      await screen.findByText('Your account is inactive. Contact your admin.', {}, { timeout: 5000 }),
    ).toBeDefined();
    expect(profileReads).toBeGreaterThan(1);
  });
});

describe('history (spec 04 AG-06)', { timeout: 15_000 }, () => {
  it('finished shipments, newest first, with what was collected; dates in the URL', async () => {
    const queries = serve(agentProfileFactory(), [
      agentShipmentFactory({ status: 'delivered', deliveredAt: '2026-10-16T12:00:00.000Z' }),
      agentShipmentFactory({ status: 'cancelled' }),
    ]);
    renderWithProviders(<History params={{ from: '2026-10-01' }} />);
    expect(await screen.findByText(/^Collected EGP\s?300\.00$/)).toBeDefined();
    expect(screen.getByText('Cancelled before pickup')).toBeDefined();
    expect(queries[0]).toEqual({
      limit: '20',
      sort: '-createdAt',
      'status[in]': 'delivered,returned_to_seller,cancelled',
      'createdAt[gte]': '2026-09-30T21:00:00.000Z',
    });
  });

  it('kind chips keep the dates; a return row is marked, handed to the seller, without money', async () => {
    const queries = serve(agentProfileFactory(), [
      agentShipmentFactory({
        kind: 'return',
        returnId: fixtureId(2),
        status: 'delivered',
        deliveredAt: '2026-10-16T12:00:00.000Z',
      }),
    ]);
    renderWithProviders(<History params={{ kind: 'return', from: '2026-10-01' }} />);
    expect(await screen.findByText('Return pickup')).toBeDefined();
    expect(screen.getAllByText('Handed to the seller', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Collected EGP/)).toBeNull();
    expect(queries[0]).toMatchObject({ 'kind[eq]': 'return' });
    const chips = screen.getByRole('navigation', { name: 'Show' });
    expect(within(chips).getByRole('link', { name: 'Return pickups' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(chips).getByRole('link', { name: 'Deliveries' }).getAttribute('href')).toBe(
      '/history?from=2026-10-01&kind=delivery',
    );
    expect(within(chips).getByRole('link', { name: 'All' }).getAttribute('href')).toBe(
      '/history?from=2026-10-01',
    );
  });

  it('an unknown kind is dropped; no kind means both', async () => {
    const queries = serve(agentProfileFactory(), []);
    renderWithProviders(<History params={{ kind: 'boat' }} />);
    expect(await screen.findByText('No finished shipments yet.')).toBeDefined();
    expect(queries[0]?.['kind[eq]']).toBeUndefined();
  });
});
