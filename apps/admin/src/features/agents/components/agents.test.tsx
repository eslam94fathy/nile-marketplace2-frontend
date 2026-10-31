// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import {
  adminAgentFactory,
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
import { AgentDetail } from './agent-detail';
import { AgentsList } from './agents-list';
import { NewAgent } from './new-agent';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

type Agent = Schema<'AdminAgentDto'>;

const GIZA = governorateFactory({ id: fixtureId(9700), name: 'Giza' });
const ASWAN = governorateFactory({ id: fixtureId(9702), name: 'Aswan' });
const SAM = adminAgentFactory({ fullName: 'Sam Nabil', email: 'sam@example.test', activeShipmentCount: 1 });
const PAGE = { nextCursor: null, hasMore: false, limit: 20 };

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  server.use(
    mockApi('get', '/admin/governorates', ({ reply }) => reply.ok([GIZA, ASWAN]), { base: BFF_BASE }),
    mockApi('get', '/admin/shipments', ({ reply }) => reply.ok([], PAGE), { base: BFF_BASE }),
    mockApi(
      'get',
      '/admin/finance/accounts',
      ({ reply }) =>
        reply.ok(
          [
            {
              id: fixtureId(13001),
              accountType: 'agent_cod_cash',
              ownerId: SAM.id,
              ownerName: 'Sam Nabil',
              balance: '300.00',
              updatedAt: '2026-10-15T12:00:00.000Z',
            },
          ],
          { ...PAGE, limit: 10 },
        ),
      { base: BFF_BASE },
    ),
  );
});

function serveAgent(agent: Agent) {
  const state = { agent, reads: 0 };
  server.use(
    mockApi(
      'get',
      '/admin/delivery-agents/{agentId}',
      ({ reply }) => {
        state.reads += 1;
        return reply.ok(state.agent);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

type Answer = Agent | { readonly status: number; readonly code: ErrorCode };

/** Records each request body (an empty one as `undefined`). */
function recorder() {
  const bodies: unknown[] = [];
  const record = async (request: Request) => {
    const text = await request.text();
    bodies.push(text === '' ? undefined : JSON.parse(text));
  };
  return { bodies, record };
}

function serveCreate(answer: Answer) {
  const { bodies, record } = recorder();
  server.use(
    mockApi(
      'post',
      '/admin/delivery-agents',
      async ({ request, reply }) => {
        await record(request);
        return 'code' in answer ? reply.error(answer.status, answer.code) : reply.ok(answer);
      },
      { base: BFF_BASE },
    ),
  );
  return bodies;
}

function serveUpdate(answer: Answer) {
  const { bodies, record } = recorder();
  server.use(
    mockApi(
      'patch',
      '/admin/delivery-agents/{agentId}',
      async ({ request, reply }) => {
        await record(request);
        return 'code' in answer ? reply.error(answer.status, answer.code) : reply.ok(answer);
      },
      { base: BFF_BASE },
    ),
  );
  return bodies;
}

function serveDeactivate(answer: Answer) {
  const { bodies, record } = recorder();
  server.use(
    mockApi(
      'post',
      '/admin/delivery-agents/{agentId}/deactivate',
      async ({ request, reply }) => {
        await record(request);
        return 'code' in answer ? reply.error(answer.status, answer.code) : reply.ok(answer);
      },
      { base: BFF_BASE },
    ),
  );
  return bodies;
}

const renderDetail = (agent: Agent = SAM) =>
  renderWithProviders(
    <>
      <AgentDetail agentId={agent.id} />
      <Toaster />
    </>,
  );

const heading = (name = 'Sam Nabil') => screen.findByRole('heading', { level: 1, name }, { timeout: 5000 });

describe('agents list (spec 03 AD-09)', { timeout: 15_000 }, () => {
  it('opens on Active, newest first; rows show governorate, sign-in and shift', async () => {
    const queries: Record<string, string>[] = [];
    server.use(
      mockApi(
        'get',
        '/admin/delivery-agents',
        ({ request, reply }) => {
          queries.push(Object.fromEntries(new URL(request.url).searchParams));
          return reply.ok([{ ...SAM, userStatus: 'invited' }], PAGE);
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<AgentsList params={{}} />);
    const table = await screen.findByRole('table', { name: 'Delivery agents' });
    expect(queries[0]).toEqual({ limit: '20', sort: '-createdAt', 'status[eq]': 'active' });
    expect((await within(table).findByRole('link', { name: 'Sam Nabil' })).getAttribute('href')).toBe(
      `/delivery/agents/${SAM.id}`,
    );
    expect(await within(table).findByText('Giza')).toBeDefined();
    expect(within(table).getByText('Invited')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Add agent' }).getAttribute('href')).toBe('/delivery/agents/new');
  });
});

describe('new agent (spec 03 AD-10)', { timeout: 15_000 }, () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText(/^Email/), ' New.Agent@Example.test ');
    await user.type(screen.getByLabelText(/^Full name/), 'New Agent');
    await user.type(screen.getByLabelText(/^Mobile number/), '01012345678');
    await user.click(screen.getByRole('combobox', { name: /^Home governorate/ }));
    await user.click(await screen.findByRole('option', { name: 'Aswan' }));
  };

  it('creates the agent, says the invite was sent and opens the agent', async () => {
    const user = userEvent.setup();
    const created = adminAgentFactory({ email: 'new.agent@example.test', userStatus: 'invited' });
    const bodies = serveCreate(created);
    renderWithProviders(
      <>
        <NewAgent />
        <Toaster />
      </>,
    );
    expect(
      screen.getByText('New shipments picked up in this governorate are assigned to agents based here.'),
    ).toBeDefined();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create agent and send invitation' }));
    expect(
      await screen.findByText("Invitation sent to new.agent@example.test. It's valid for 72 hours."),
    ).toBeDefined();
    expect(bodies).toEqual([
      {
        email: 'new.agent@example.test',
        fullName: 'New Agent',
        phone: '+201012345678',
        homeGovernorateId: ASWAN.id,
      },
    ]);
    expect(router.push).toHaveBeenCalledWith(`/delivery/agents/${created.id}`);
  });

  it('EMAIL_ALREADY_REGISTERED goes on the email field', async () => {
    const user = userEvent.setup();
    serveCreate({ status: 409, code: 'EMAIL_ALREADY_REGISTERED' });
    renderWithProviders(<NewAgent />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create agent and send invitation' }));
    expect(await screen.findByText('This email already has an account.')).toBeDefined();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('validation errors stay in the form', async () => {
    const user = userEvent.setup();
    const bodies = serveCreate(SAM);
    renderWithProviders(<NewAgent />);
    await user.click(screen.getByRole('button', { name: 'Create agent and send invitation' }));
    expect((await screen.findAllByText('This field is required.')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/^Full name/).getAttribute('aria-invalid')).toBe('true');
    expect(bodies).toEqual([]);
  });
});

describe('agent (spec 03 AD-11)', { timeout: 15_000 }, () => {
  it('details, invite note, balances and the shortcuts', async () => {
    serveAgent({ ...SAM, userStatus: 'invited' });
    renderDetail();
    await heading();
    expect(
      screen.getByText(
        "The agent hasn't accepted their invitation yet. If it expires, it can't be sent again from the console.",
      ),
    ).toBeDefined();
    const balances = await screen.findByRole('table', { name: "The agent's finance accounts" });
    expect(within(balances).getByText('Agent COD cash')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Record COD cash received' }).getAttribute('href')).toBe(
      `/finance/remittances?agent=${SAM.id}`,
    );
    expect(screen.getByRole('link', { name: 'Record payout' }).getAttribute('href')).toBe(
      `/finance/payouts?payeeType=agent&payeeId=${SAM.id}`,
    );
    expect(screen.getByRole('link', { name: "All of this agent's shipments" }).getAttribute('href')).toBe(
      `/delivery/shipments?status=all&agent=${SAM.id}`,
    );
  });

  it('active shipments are read for this agent only', async () => {
    const queries: Record<string, string>[] = [];
    const shipment = adminShipmentFactory({ status: 'assigned', agentId: SAM.id });
    server.use(
      mockApi(
        'get',
        '/admin/shipments',
        ({ request, reply }) => {
          queries.push(Object.fromEntries(new URL(request.url).searchParams));
          return reply.ok([shipment], PAGE);
        },
        { base: BFF_BASE },
      ),
    );
    serveAgent(SAM);
    renderDetail();
    const table = await screen.findByRole(
      'table',
      { name: "This agent's active shipments" },
      { timeout: 5000 },
    );
    expect(await within(table).findByRole('link', { name: `Order ${shipment.orderNumber}` })).toBeDefined();
    expect(queries[0]).toEqual({
      limit: '20',
      sort: '-createdAt',
      'agentId[eq]': SAM.id,
      'status[in]': 'assigned,picked_up,out_for_delivery,delivery_failed,returning_to_seller,pickup_failed',
    });
  });

  it('deactivate asks first; AGENT_HAS_ACTIVE_SHIPMENTS points to the active shipments', async () => {
    const user = userEvent.setup();
    serveAgent(SAM);
    serveDeactivate({
      status: 409,
      code: 'AGENT_HAS_ACTIVE_SHIPMENTS',
    });
    renderDetail();
    await heading();
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Deactivate agent' });
    expect(
      within(dialog).getByText(
        "Deactivate Sam Nabil? The agent goes off shift, gets no new work and can't sign in.",
      ),
    ).toBeDefined();
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText("Reassign or finish this agent's active shipments first.")).toBeDefined();
    expect(screen.getByRole('link', { name: 'See the active shipments' }).getAttribute('href')).toBe(
      '#active-shipments',
    );
    expect(document.getElementById('active-shipments')).not.toBeNull();
  });

  it('deactivate and activate replace the agent from the answer', async () => {
    const user = userEvent.setup();
    const state = serveAgent(SAM);
    serveDeactivate({
      ...SAM,
      status: 'inactive',
      userStatus: 'suspended',
    });
    renderDetail();
    await heading();
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    state.agent = { ...SAM, status: 'inactive', userStatus: 'suspended' };
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText('Sam Nabil is inactive.')).toBeDefined();
    expect(await screen.findByRole('button', { name: 'Activate' })).toBeDefined();
  });

  it('AGENT_INVALID_STATUS_TRANSITION refetches and explains', async () => {
    const user = userEvent.setup();
    const state = serveAgent(SAM);
    serveDeactivate({
      status: 409,
      code: 'AGENT_INVALID_STATUS_TRANSITION',
    });
    renderDetail();
    await heading();
    const before = state.reads;
    state.agent = { ...SAM, status: 'inactive' };
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
    expect(
      await screen.findByText('This agent changed meanwhile. Here is their current state.'),
    ).toBeDefined();
    await waitFor(() => {
      expect(state.reads).toBeGreaterThan(before);
    });
    expect(await screen.findByRole('button', { name: 'Activate' })).toBeDefined();
  });

  it('edit sends only the changed fields; Save is off without a change', async () => {
    const user = userEvent.setup();
    serveAgent(SAM);
    const bodies = serveUpdate({
      ...SAM,
      homeGovernorateId: ASWAN.id,
    });
    renderDetail();
    await heading();
    const save = screen.getByRole('button', { name: 'Save changes' });
    await waitFor(() => {
      expect((save as HTMLButtonElement).disabled).toBe(true);
    });
    await user.click(screen.getByRole('combobox', { name: /^Home governorate/ }));
    await user.click(await screen.findByRole('option', { name: 'Aswan' }));
    await user.click(save);
    expect(await screen.findByText('Agent details saved.')).toBeDefined();
    expect(bodies).toEqual([{ homeGovernorateId: ASWAN.id }]);
  });

  it('an unknown agent is "not found"', async () => {
    server.use(
      mockApi('get', '/admin/delivery-agents/{agentId}', ({ reply }) => reply.error(404, 'AGENT_NOT_FOUND'), {
        base: BFF_BASE,
      }),
    );
    renderDetail();
    expect(await screen.findByText("This agent doesn't exist.", {}, { timeout: 5000 })).toBeDefined();
  });
});
