// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import { fixtureId, governorateFactory, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { DeliverySettingsView } from './delivery-settings';

const server = setupMswServer();

type Governorate = Schema<'GovernorateDto'>;

const CAIRO = governorateFactory({ id: fixtureId(9700), name: 'Cairo', code: 'EG-C', deliveryFee: '40.00' });
const ASWAN = governorateFactory({
  id: fixtureId(9701),
  name: 'Aswan',
  code: 'EG-ASN',
  deliveryFee: null,
  isDeliverable: false,
});

function serve(governorates: Governorate[] = [CAIRO, ASWAN]) {
  const state = { governorates, reads: 0, patches: [] as unknown[] };
  server.use(
    mockApi(
      'get',
      '/admin/governorates',
      ({ reply }) => {
        state.reads += 1;
        return reply.ok(state.governorates);
      },
      { base: BFF_BASE },
    ),
    mockApi(
      'get',
      '/admin/settings/delivery',
      ({ reply }) => reply.ok({ agentFeeShareRate: '0.7000', updatedAt: '2026-10-14T08:00:00.000Z' }),
      { base: BFF_BASE },
    ),
  );
  return state;
}

// An error answer is told apart by `status` (a governorate has a `code` of its own).
type Answer = Governorate | { readonly status: number; readonly code: ErrorCode };

function servePatch(answer: (body: { deliveryFee: string | null }) => Answer) {
  const bodies: unknown[] = [];
  server.use(
    mockApi(
      'patch',
      '/admin/governorates/{governorateId}',
      async ({ request, reply }) => {
        const body = (await request.json()) as { deliveryFee: string | null };
        bodies.push(body);
        const result = answer(body);
        return 'status' in result ? reply.error(result.status, result.code) : reply.ok(result);
      },
      { base: BFF_BASE },
    ),
  );
  return bodies;
}

const render = () =>
  renderWithProviders(
    <>
      <DeliverySettingsView />
      <Toaster />
    </>,
  );

const table = () => screen.findByRole('table', { name: 'Governorates and delivery fees' });

beforeEach(() => {
  serve();
});

describe('delivery settings (spec 03 AD-08)', { timeout: 15_000 }, () => {
  it('agent share as a percent; saving asks first and sends the fraction', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'put',
        '/admin/settings/delivery',
        async ({ request, reply }) => {
          bodies.push(await request.json());
          return reply.ok({ agentFeeShareRate: '0.6550', updatedAt: '2026-10-16T08:00:00.000Z' });
        },
        { base: BFF_BASE },
      ),
    );
    render();
    expect(await screen.findByText('70%')).toBeDefined();
    const input = screen.getByLabelText(/^New agent share/);
    await user.clear(input);
    await user.type(input, '65.5');
    await user.click(screen.getByRole('button', { name: 'Save agent share' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change the agent share' });
    expect(
      within(dialog).getByText(
        'Set the agent share to 65.5%? Applies to new orders only. Nile keeps the rest of the fee.',
      ),
    ).toBeDefined();
    expect(bodies).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Save agent share' }));
    expect(await screen.findByText('The agent share is now 65.5%.')).toBeDefined();
    expect(bodies).toEqual([{ agentFeeShareRate: '0.6550' }]);
  });

  it('governorates by name with fee and deliverable; "Stop delivering" only where deliverable', async () => {
    render();
    const rows = within(await table()).getAllByRole('row');
    expect(rows[1]?.textContent).toContain('Aswan');
    expect(rows[1]?.textContent).toContain('Not deliverable');
    expect(rows[2]?.textContent).toContain('Cairo');
    expect(rows[2]?.textContent).toMatch(/40\.00/);
    expect(screen.queryByRole('button', { name: 'Stop delivering to Aswan' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop delivering to Cairo' })).toBeDefined();
    expect(screen.getByText('Fee changes apply to new orders only.')).toBeDefined();
  });

  it('"Set fee" always sends deliveryFee as a string; the row updates from the answer', async () => {
    const user = userEvent.setup();
    const bodies = servePatch((body) => ({ ...ASWAN, deliveryFee: body.deliveryFee, isDeliverable: true }));
    render();
    await table();
    await user.click(screen.getByRole('button', { name: 'Set fee for Aswan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delivery fee for Aswan' });
    await user.type(within(dialog).getByLabelText(/^Delivery fee/), '12.x');
    await user.click(within(dialog).getByRole('button', { name: 'Save fee' }));
    expect(bodies).toEqual([]);
    const input = within(dialog).getByLabelText(/^Delivery fee/);
    await user.clear(input);
    await user.type(input, '0');
    await user.click(within(dialog).getByRole('button', { name: 'Save fee' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(bodies).toEqual([{ deliveryFee: '0' }]);
    expect(await screen.findByRole('button', { name: 'Stop delivering to Aswan' })).toBeDefined();
  });

  it('"Stop delivering" confirms and sends deliveryFee: null', async () => {
    const user = userEvent.setup();
    const bodies = servePatch(() => ({ ...CAIRO, deliveryFee: null, isDeliverable: false }));
    render();
    await table();
    await user.click(screen.getByRole('button', { name: 'Stop delivering to Cairo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Stop delivering to Cairo' });
    expect(
      within(dialog).getByText("Customers can't check out to Cairo until you set a fee again."),
    ).toBeDefined();
    await user.click(within(dialog).getByRole('button', { name: 'Stop delivering' }));
    expect(await screen.findByText('Cairo is no longer deliverable.')).toBeDefined();
    expect(bodies).toEqual([{ deliveryFee: null }]);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Stop delivering to Cairo' })).toBeNull();
    });
  });

  it('GOVERNORATE_NOT_FOUND closes, reloads the list and explains', async () => {
    const user = userEvent.setup();
    const state = serve();
    servePatch(() => ({ status: 404, code: 'GOVERNORATE_NOT_FOUND' }));
    render();
    await table();
    const before = state.reads;
    await user.click(screen.getByRole('button', { name: 'Stop delivering to Cairo' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Stop delivering' }),
    );
    expect(
      await screen.findByText('This governorate no longer exists. The list was reloaded.'),
    ).toBeDefined();
    await waitFor(() => {
      expect(state.reads).toBeGreaterThan(before);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a list that fails to load offers a retry', async () => {
    server.use(
      mockApi('get', '/admin/governorates', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
    );
    render();
    expect(
      await screen.findByText("The governorates couldn't be loaded.", {}, { timeout: 5000 }),
    ).toBeDefined();
    expect(screen.getAllByRole('button', { name: /try again/i }).length).toBeGreaterThan(0);
  });
});
