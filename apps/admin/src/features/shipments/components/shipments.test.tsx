// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import {
  adminAgentFactory,
  adminListItemFactory,
  adminShipmentFactory,
  fixtureId,
  governorateFactory,
  mockApi,
} from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { ShipmentDetail } from './shipment-detail';
import { ShipmentsList } from './shipments-list';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

type Shipment = Schema<'AdminShipmentDto'>;
type Agent = Schema<'AdminAgentDto'>;

const GIZA = governorateFactory({ id: fixtureId(9700), name: 'Giza' });
const ASWAN = governorateFactory({ id: fixtureId(9702), name: 'Aswan' });
const ME = adminListItemFactory({ email: 'me@example.test' });
const SAM = adminAgentFactory({ id: fixtureId(10001), fullName: 'Sam Nabil' });
const HODA = adminAgentFactory({
  id: fixtureId(10002),
  fullName: 'Hoda Ali',
  onShift: true,
  homeGovernorateId: GIZA.id,
  activeShipmentCount: 2,
});
const OMAR = adminAgentFactory({ id: fixtureId(10003), fullName: 'Omar Said', homeGovernorateId: ASWAN.id });
const PAGE = { nextCursor: null, hasMore: false, limit: 20 };

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  server.use(
    mockApi('get', '/admin/governorates', ({ reply }) => reply.ok([GIZA, ASWAN]), { base: BFF_BASE }),
    mockApi('get', '/admin/admins', ({ reply }) => reply.ok([ME], { ...PAGE, limit: 100 }), {
      base: BFF_BASE,
    }),
    mockApi(
      'get',
      '/admin/delivery-agents/{agentId}',
      ({ params, reply }) => {
        const agent = [SAM, HODA, OMAR].find((item) => item.id === params.agentId);
        return agent === undefined ? reply.error(404, 'AGENT_NOT_FOUND') : reply.ok(agent);
      },
      { base: BFF_BASE },
    ),
  );
});

function serveList(rows: Shipment[]) {
  const queries: Record<string, string>[] = [];
  server.use(
    mockApi(
      'get',
      '/admin/shipments',
      ({ request, reply }) => {
        queries.push(Object.fromEntries(new URL(request.url).searchParams));
        return reply.ok(rows, PAGE);
      },
      { base: BFF_BASE },
    ),
    mockApi(
      'get',
      '/admin/delivery-agents',
      ({ reply }) => reply.ok([SAM, HODA, OMAR], { ...PAGE, limit: 100 }),
      {
        base: BFF_BASE,
      },
    ),
  );
  return queries;
}

function serveShipment(shipment: Shipment) {
  const state = { shipment, reads: 0 };
  server.use(
    mockApi(
      'get',
      '/admin/shipments/{shipmentId}',
      ({ reply }) => {
        state.reads += 1;
        return reply.ok(state.shipment);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

function serveAssignable(agents: Agent[]) {
  const queries: Record<string, string>[] = [];
  server.use(
    mockApi(
      'get',
      '/admin/delivery-agents',
      ({ request, reply }) => {
        queries.push(Object.fromEntries(new URL(request.url).searchParams));
        return reply.ok(agents, { ...PAGE, limit: 100 });
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

type Answer = Shipment | { readonly status: number; readonly code: ErrorCode };

function serveAssign(answer: Answer) {
  const bodies: unknown[] = [];
  server.use(
    mockApi(
      'post',
      '/admin/shipments/{shipmentId}/assign',
      async ({ request, reply }) => {
        bodies.push(await request.json());
        return 'code' in answer ? reply.error(answer.status, answer.code) : reply.ok(answer);
      },
      { base: BFF_BASE },
    ),
  );
  return bodies;
}

const renderDetail = (shipment: Shipment) =>
  renderWithProviders(
    <>
      <ShipmentDetail shipmentId={shipment.id} currentUserId={ME.id} />
      <Toaster />
    </>,
  );

describe('shipments list (spec 03 AD-12)', { timeout: 15_000 }, () => {
  it('opens on Unassigned, oldest first; rows show pickup governorate, agent name and amount', async () => {
    const assigned = adminShipmentFactory({ agentId: SAM.id, status: 'assigned' });
    const queries = serveList([adminShipmentFactory(), assigned]);
    renderWithProviders(<ShipmentsList params={{}} />);
    const table = await screen.findByRole('table', { name: 'Shipments' });
    expect(queries[0]).toEqual({ limit: '20', sort: 'createdAt', 'status[eq]': 'unassigned' });
    expect(screen.getByRole('link', { name: 'Unassigned' }).getAttribute('aria-current')).toBe('page');
    expect(within(table).getAllByText('Giza').length).toBe(2);
    // The first row: status badge and the agent column.
    expect(within(table).getAllByText('Unassigned')).toHaveLength(2);
    const agent = await within(table).findByRole('link', { name: 'Sam Nabil' });
    expect(agent.getAttribute('href')).toBe(`/delivery/agents/${SAM.id}`);
    expect(
      within(table)
        .getByRole('link', { name: `Order ${assigned.orderNumber}` })
        .getAttribute('href'),
    ).toBe(`/delivery/shipments/${assigned.id}`);
  });

  it('agent and order from the URL reach the API; the order filter can be cleared', async () => {
    const order = fixtureId(11501);
    const queries = serveList([]);
    renderWithProviders(<ShipmentsList params={{ status: 'all', agent: OMAR.id, order }} />);
    expect(await screen.findByText('No shipments match these filters.')).toBeDefined();
    expect(queries[0]).toEqual({
      limit: '20',
      sort: '-createdAt',
      'agentId[eq]': OMAR.id,
      'orderId[eq]': order,
    });
    expect(screen.getByRole('link', { name: 'Show all orders' }).getAttribute('href')).toBe(
      `/delivery/shipments?status=all&agent=${OMAR.id}`,
    );
  });

  it('a failed list offers a retry', async () => {
    server.use(
      mockApi('get', '/admin/shipments', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
      mockApi('get', '/admin/delivery-agents', ({ reply }) => reply.ok([], PAGE), { base: BFF_BASE }),
    );
    renderWithProviders(<ShipmentsList params={{}} />);
    expect(await screen.findByText("The shipments couldn't be loaded.", {}, { timeout: 5000 })).toBeDefined();
  });
});

describe('shipment (spec 03 AD-13)', { timeout: 15_000 }, () => {
  it('shows the parcel, money, attempts and history with labels and actors', async () => {
    const shipment = adminShipmentFactory({
      status: 'delivery_failed',
      agentId: SAM.id,
      attemptCount: 1,
      attempts: [
        {
          attemptNumber: 1,
          reason: 'customer_unreachable',
          note: 'No answer',
          createdAt: '2026-10-15T12:00:00.000Z',
        },
      ],
      history: [
        {
          fromStatus: 'assigned',
          toStatus: 'picked_up',
          actorRole: 'delivery_agent',
          actorUserId: fixtureId(12000),
          reason: null,
          createdAt: '2026-10-15T10:00:00.000Z',
        },
        {
          fromStatus: 'unassigned',
          toStatus: 'assigned',
          actorRole: 'admin',
          actorUserId: ME.id,
          reason: null,
          createdAt: '2026-10-15T09:00:00.000Z',
        },
      ],
    });
    serveShipment(shipment);
    renderDetail(shipment);
    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: `Order ${shipment.orderNumber}` },
        { timeout: 5000 },
      ),
    ).toBeDefined();
    expect(screen.getByText('Attempt failed', { selector: 'span' })).toBeDefined();
    expect(screen.getByRole('link', { name: shipment.orderNumber }).getAttribute('href')).toBe(
      `/orders/${shipment.orderId}`,
    );
    expect(await screen.findByRole('link', { name: 'Sam Nabil' })).toBeDefined();
    expect(screen.getByText('Customer unreachable')).toBeDefined();
    expect(screen.getByText('No answer')).toBeDefined();
    const history = screen.getByRole('table', { name: 'Status changes' });
    expect(within(history).getByText('Assigned → Picked up')).toBeDefined();
    expect(within(history).getByText('Agent')).toBeDefined();
    expect(await within(history).findByText('you')).toBeDefined();
    expect(screen.getByText(/7 Victor Emmanuel, floor 3, Smouha, Alexandria, Alexandria/)).toBeDefined();
    // Picked up already: no (re)assignment [SPEC 11 S-18].
    expect(screen.queryByRole('button', { name: /assign/i })).toBeNull();
  });

  it('says when the seller order was cancelled after pickup', async () => {
    const shipment = adminShipmentFactory({
      status: 'returning_to_seller',
      sellerOrderCancelledAt: '2026-10-15T12:00:00.000Z',
    });
    serveShipment(shipment);
    renderDetail(shipment);
    expect(
      await screen.findByText(/^Seller order cancelled after pickup at /, {}, { timeout: 5000 }),
    ).toBeDefined();
  });

  it('assign: active agents only, the current one left out, preferred first; the answer replaces the page', async () => {
    const user = userEvent.setup();
    const shipment = adminShipmentFactory({ status: 'assigned', agentId: SAM.id });
    const state = serveShipment(shipment);
    const queries = serveAssignable([SAM, OMAR, HODA]);
    const bodies = serveAssign({ ...shipment, agentId: OMAR.id });
    renderDetail(shipment);
    await user.click(await screen.findByRole('button', { name: 'Reassign' }, { timeout: 5000 }));
    const dialog = await screen.findByRole('dialog', {
      name: `Assign the shipment of order ${shipment.orderNumber}`,
    });
    expect(
      within(dialog).getByText(
        'You can choose any active agent, even off shift or from another governorate.',
      ),
    ).toBeDefined();
    const buttons = await within(dialog).findAllByRole('button', { name: /^Assign to / });
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Assign to Hoda Ali',
      'Assign to Omar Said',
    ]);
    expect(queries[0]).toMatchObject({ 'status[eq]': 'active' });
    expect(within(dialog).getByText('2 active shipments')).toBeDefined();
    expect(within(dialog).getByText('Based in Aswan')).toBeDefined();
    state.shipment = { ...shipment, agentId: OMAR.id };
    await user.click(within(dialog).getByRole('button', { name: 'Assign to Omar Said' }));
    expect(await screen.findByText('Assigned to Omar Said.')).toBeDefined();
    expect(bodies).toEqual([{ agentId: OMAR.id }]);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByRole('link', { name: 'Omar Said' })).toBeDefined();
  });

  it('SHIPMENT_NOT_ASSIGNABLE closes the dialog, refetches and explains', async () => {
    const user = userEvent.setup();
    const shipment = adminShipmentFactory();
    const state = serveShipment(shipment);
    serveAssignable([HODA]);
    serveAssign({ status: 409, code: 'SHIPMENT_NOT_ASSIGNABLE' });
    renderDetail(shipment);
    await user.click(await screen.findByRole('button', { name: 'Assign' }, { timeout: 5000 }));
    const before = state.reads;
    state.shipment = { ...shipment, status: 'picked_up', agentId: HODA.id };
    await user.click(await screen.findByRole('button', { name: 'Assign to Hoda Ali' }));
    expect(await screen.findByText('It has been picked up already.')).toBeDefined();
    await waitFor(() => {
      expect(state.reads).toBeGreaterThan(before);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
    });
  });

  it('AGENT_INACTIVE keeps the dialog open, explains and reloads the agents', async () => {
    const user = userEvent.setup();
    const shipment = adminShipmentFactory();
    serveShipment(shipment);
    const queries = serveAssignable([HODA]);
    serveAssign({ status: 409, code: 'AGENT_INACTIVE' });
    renderDetail(shipment);
    await user.click(await screen.findByRole('button', { name: 'Assign' }, { timeout: 5000 }));
    await user.click(await screen.findByRole('button', { name: 'Assign to Hoda Ali' }));
    const dialog = screen.getByRole('dialog');
    expect(
      await within(dialog).findByText('This agent can no longer take shipments. The list was refreshed.'),
    ).toBeDefined();
    await waitFor(() => {
      expect(queries.length).toBe(2);
    });
  });

  it('an unknown shipment is "not found"', async () => {
    server.use(
      mockApi('get', '/admin/shipments/{shipmentId}', ({ reply }) => reply.error(404, 'SHIPMENT_NOT_FOUND'), {
        base: BFF_BASE,
      }),
    );
    renderDetail(adminShipmentFactory());
    expect(await screen.findByText("This shipment doesn't exist.", {}, { timeout: 5000 })).toBeDefined();
  });
});
