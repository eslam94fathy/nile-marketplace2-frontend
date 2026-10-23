// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import { agentProfileFactory, agentShipmentFactory, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { attemptConsequence } from './failed-attempt-sheet';
import { ShipmentView } from './shipment-view';

const server = setupMswServer();

type Shipment = Schema<'AgentShipmentDto'>;
interface Failure {
  readonly status: number;
  readonly code: ErrorCode;
}
type Answer = Shipment | Failure;
type ActionPath =
  | '/agent/shipments/{shipmentId}/picked-up'
  | '/agent/shipments/{shipmentId}/out-for-delivery'
  | '/agent/shipments/{shipmentId}/delivered'
  | '/agent/shipments/{shipmentId}/failed-attempt'
  | '/agent/shipments/{shipmentId}/returned';

const isFailure = (answer: Answer): answer is Failure => !('id' in answer);

beforeEach(() => {
  server.use(
    mockApi('get', '/agent/profile', ({ reply }) => reply.ok(agentProfileFactory()), { base: BFF_BASE }),
  );
});

/** Serves the shipment; `state.shipment` can be changed to simulate the backend moving on. */
function serveShipment(shipment: Shipment) {
  const state = { shipment, reads: 0 };
  server.use(
    mockApi(
      'get',
      '/agent/shipments/{shipmentId}',
      ({ reply }) => {
        state.reads += 1;
        return reply.ok(state.shipment);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

/** Records each call (Idempotency-Key and body); answers in order, the last one repeated. */
function serveAction(path: ActionPath, answers: Answer[], onSuccess?: (shipment: Shipment) => void) {
  const calls: { key: string | null; body: unknown }[] = [];
  const handle = async (request: Request) => {
    const text = await request.text();
    calls.push({
      key: request.headers.get('Idempotency-Key'),
      body: text === '' ? undefined : JSON.parse(text),
    });
    const answer = answers[Math.min(calls.length, answers.length) - 1];
    if (answer === undefined) throw new Error('no answer');
    if (!isFailure(answer)) onSuccess?.(answer);
    return answer;
  };
  const options = { base: BFF_BASE };
  // One handler per path keeps each mock typed by the snapshot.
  switch (path) {
    case '/agent/shipments/{shipmentId}/picked-up':
      server.use(
        mockApi(
          'post',
          path,
          async ({ request, reply }) => {
            const answer = await handle(request);
            return isFailure(answer) ? reply.error(answer.status, answer.code) : reply.ok(answer);
          },
          options,
        ),
      );
      break;
    case '/agent/shipments/{shipmentId}/out-for-delivery':
      server.use(
        mockApi(
          'post',
          path,
          async ({ request, reply }) => {
            const answer = await handle(request);
            return isFailure(answer) ? reply.error(answer.status, answer.code) : reply.ok(answer);
          },
          options,
        ),
      );
      break;
    case '/agent/shipments/{shipmentId}/delivered':
      server.use(
        mockApi(
          'post',
          path,
          async ({ request, reply }) => {
            const answer = await handle(request);
            return isFailure(answer) ? reply.error(answer.status, answer.code) : reply.ok(answer);
          },
          options,
        ),
      );
      break;
    case '/agent/shipments/{shipmentId}/failed-attempt':
      server.use(
        mockApi(
          'post',
          path,
          async ({ request, reply }) => {
            const answer = await handle(request);
            return isFailure(answer) ? reply.error(answer.status, answer.code) : reply.ok(answer);
          },
          options,
        ),
      );
      break;
    case '/agent/shipments/{shipmentId}/returned':
      server.use(
        mockApi(
          'post',
          path,
          async ({ request, reply }) => {
            const answer = await handle(request);
            return isFailure(answer) ? reply.error(answer.status, answer.code) : reply.ok(answer);
          },
          options,
        ),
      );
      break;
  }
  return calls;
}

const render = (shipment: Shipment) =>
  renderWithProviders(
    <>
      <ShipmentView shipmentId={shipment.id} />
      <Toaster />
    </>,
  );

const actions = () => screen.findByRole('group', { name: 'Shipment actions' }, { timeout: 5000 });

describe('shipment (spec 04 AG-05)', { timeout: 20_000 }, () => {
  it('pickup and drop-off with call and maps links; COD breakdown and "confirmed later" note', async () => {
    const shipment = agentShipmentFactory();
    serveShipment(shipment);
    render(shipment);
    expect(
      await screen.findByRole('heading', { level: 1, name: `Order ${shipment.orderNumber}` }),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Call Nile Crafts' }).getAttribute('href')).toBe(
      'tel:+201112345678',
    );
    expect(screen.getByRole('link', { name: 'Call Mona Adel' }).getAttribute('href')).toBe(
      'tel:+201001234567',
    );
    const maps = screen.getByRole('link', { name: 'Open Mona Adel in maps' });
    expect(maps.getAttribute('href')).toContain(
      encodeURIComponent('7 Tahrir St, floor 3, apartment 12, Dokki'),
    );
    expect(maps.getAttribute('target')).toBe('_blank');
    expect(screen.getByText(/^Items EGP\s?250\.00 \+ delivery EGP\s?50\.00$/)).toBeDefined();
    expect(screen.getByText('The amount is confirmed when you start the delivery.')).toBeDefined();
  });

  it('assigned → "Picked up" (confirmed, no idempotency key) → the answer replaces the screen', async () => {
    const user = userEvent.setup();
    const shipment = agentShipmentFactory();
    const state = serveShipment(shipment);
    const calls = serveAction(
      '/agent/shipments/{shipmentId}/picked-up',
      [{ ...shipment, status: 'picked_up' }],
      (next) => {
        state.shipment = next;
      },
    );
    render(shipment);
    const bar = await actions();
    expect(within(bar).getAllByRole('button')).toHaveLength(1);
    await user.click(within(bar).getByRole('button', { name: 'Picked up' }));
    const dialog = await screen.findByRole('dialog', { name: 'Collected the parcel?' });
    expect(within(dialog).getByText('Did you collect the parcel from Nile Crafts?')).toBeDefined();
    await user.click(within(dialog).getByRole('button', { name: 'Picked up' }));
    expect(await screen.findByText('Marked as picked up.')).toBeDefined();
    expect(calls).toEqual([{ key: null, body: undefined }]);
    expect(await within(await actions()).findByRole('button', { name: 'Start delivery' })).toBeDefined();
  });

  it('picked up → "Start delivery" → out for delivery shows Delivered and Delivery failed', async () => {
    const user = userEvent.setup();
    const shipment = agentShipmentFactory({ status: 'picked_up' });
    const state = serveShipment(shipment);
    serveAction(
      '/agent/shipments/{shipmentId}/out-for-delivery',
      [{ ...shipment, status: 'out_for_delivery' }],
      (next) => {
        state.shipment = next;
      },
    );
    render(shipment);
    await user.click(within(await actions()).getByRole('button', { name: 'Start delivery' }));
    expect(await screen.findByText('Delivery started.')).toBeDefined();
    const bar = await actions();
    expect(await within(bar).findByRole('button', { name: 'Delivered' })).toBeDefined();
    expect(within(bar).getByRole('button', { name: 'Delivery failed' })).toBeDefined();
    expect(screen.queryByText('The amount is confirmed when you start the delivery.')).toBeNull();
  });

  it('COD delivered: tick required; sends the API amount; a retry reuses the key; then "Delivered"', async () => {
    const user = userEvent.setup();
    const shipment = agentShipmentFactory({ status: 'out_for_delivery' });
    serveShipment(shipment);
    const calls = serveAction('/agent/shipments/{shipmentId}/delivered', [
      { status: 500, code: 'INTERNAL_ERROR' },
      { ...shipment, status: 'delivered', deliveredAt: '2026-10-16T12:00:00.000Z' },
    ]);
    render(shipment);
    await user.click(within(await actions()).getByRole('button', { name: 'Delivered' }));
    const sheet = await screen.findByRole('dialog', { name: 'Deliver the parcel' });
    await user.click(within(sheet).getByRole('button', { name: 'Confirm delivery' }));
    expect(within(sheet).getByText('Tick the box once you have the cash.')).toBeDefined();
    expect(calls).toEqual([]);
    await user.click(within(sheet).getByRole('checkbox', { name: /^I collected EGP\s?300\.00$/ }));
    await user.click(within(sheet).getByRole('button', { name: 'Confirm delivery' }));
    expect(await within(sheet).findByRole('alert')).toBeDefined();
    await user.click(within(sheet).getByRole('button', { name: 'Confirm delivery' }));
    expect(await screen.findByText(`Order ${shipment.orderNumber} is delivered.`)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to shipments' }).getAttribute('href')).toBe('/');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.body).toEqual({ codCollectedAmount: '300.00' });
    expect(calls[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[1]?.key).toBe(calls[0]?.key);
  });

  it('COD_AMOUNT_MISMATCH reads the shipment again, shows the new amount and asks to tick again', async () => {
    const user = userEvent.setup();
    const shipment = agentShipmentFactory({ status: 'out_for_delivery' });
    const state = serveShipment(shipment);
    const calls = serveAction('/agent/shipments/{shipmentId}/delivered', [
      { status: 422, code: 'COD_AMOUNT_MISMATCH' },
      { ...shipment, status: 'delivered', amountToCollect: '350.00' },
    ]);
    render(shipment);
    await user.click(within(await actions()).getByRole('button', { name: 'Delivered' }));
    const sheet = await screen.findByRole('dialog', { name: 'Deliver the parcel' });
    await user.click(within(sheet).getByRole('checkbox'));
    state.shipment = { ...shipment, amountToCollect: '350.00', codFeeAmount: '100.00' };
    await user.click(within(sheet).getByRole('button', { name: 'Confirm delivery' }));
    expect(
      await within(sheet).findByText(/^The amount to collect changed\. Please collect EGP\s?350\.00\.$/),
    ).toBeDefined();
    const box = within(sheet).getByRole('checkbox', { name: /^I collected EGP\s?350\.00$/ });
    expect(box.getAttribute('data-state')).toBe('unchecked');
    await user.click(box);
    await user.click(within(sheet).getByRole('button', { name: 'Confirm delivery' }));
    expect(await screen.findByText(`Order ${shipment.orderNumber} is delivered.`)).toBeDefined();
    expect(calls[1]?.body).toEqual({ codCollectedAmount: '350.00' });
    expect(calls[1]?.key).not.toBe(calls[0]?.key);
  });

  it('card delivered: a confirmation, no amount sent', async () => {
    const user = userEvent.setup();
    const shipment = agentShipmentFactory({ status: 'out_for_delivery', paymentMethod: 'kashier' });
    serveShipment(shipment);
    const calls = serveAction('/agent/shipments/{shipmentId}/delivered', [
      { ...shipment, status: 'delivered' },
    ]);
    render(shipment);
    expect(await screen.findByText('Prepaid — collect nothing')).toBeDefined();
    await user.click(within(await actions()).getByRole('button', { name: 'Delivered' }));
    const sheet = await screen.findByRole('dialog', { name: 'Deliver the parcel' });
    expect(within(sheet).getByText('Hand the parcel to Mona Adel? Nothing to collect.')).toBeDefined();
    await user.click(within(sheet).getByRole('button', { name: 'Confirm delivery' }));
    expect(await screen.findByText(`Order ${shipment.orderNumber} is delivered.`)).toBeDefined();
    expect(calls[0]?.body).toEqual({});
  });

  it('delivery failed: reason required, consequence stated, note omitted when empty', async () => {
    const user = userEvent.setup();
    const shipment = agentShipmentFactory({ status: 'out_for_delivery', attemptCount: 1 });
    serveShipment(shipment);
    const calls = serveAction('/agent/shipments/{shipmentId}/failed-attempt', [
      { ...shipment, status: 'delivery_failed', attemptCount: 2 },
    ]);
    render(shipment);
    await user.click(within(await actions()).getByRole('button', { name: 'Delivery failed' }));
    const sheet = await screen.findByRole('dialog', { name: 'Delivery failed' });
    await user.click(within(sheet).getByRole('button', { name: 'Report failed attempt' }));
    expect(within(sheet).getByText('Choose a reason.')).toBeDefined();
    await user.click(within(sheet).getByRole('radio', { name: 'Customer unreachable' }));
    expect(within(sheet).getByText('You can try again later (attempt 2 of 3).')).toBeDefined();
    await user.click(within(sheet).getByRole('radio', { name: 'Customer refused the parcel' }));
    expect(within(sheet).getByText('The parcel goes back to the seller. No more attempts.')).toBeDefined();
    await user.click(within(sheet).getByRole('radio', { name: 'Wrong address' }));
    await user.click(within(sheet).getByRole('button', { name: 'Report failed attempt' }));
    expect(await screen.findByText('Failed attempt recorded.')).toBeDefined();
    expect(calls[0]?.body).toEqual({ reason: 'wrong_address' });
    expect(calls[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('the consequence rule: refused, the third attempt, otherwise retry', () => {
    expect(attemptConsequence('customer_refused', 0)).toBe(
      'The parcel goes back to the seller. No more attempts.',
    );
    expect(attemptConsequence('wrong_address', 2)).toBe(
      'This was the last attempt. The parcel goes back to the seller.',
    );
    expect(attemptConsequence('wrong_address', 0)).toBe('You can try again later (attempt 1 of 3).');
    expect(attemptConsequence(null, 0)).toBeNull();
  });

  it('returning: "Handed back" only when cancelled after pickup (AG-Q-1), with a key', async () => {
    const user = userEvent.setup();
    const shipment = agentShipmentFactory({
      status: 'returning_to_seller',
      pickedUpAt: '2026-10-16T09:00:00.000Z',
    });
    serveShipment(shipment);
    const calls = serveAction('/agent/shipments/{shipmentId}/returned', [
      { ...shipment, status: 'returned_to_seller' },
    ]);
    render(shipment);
    await user.click(within(await actions()).getByRole('button', { name: 'Handed back to seller' }));
    const dialog = await screen.findByRole('dialog', { name: 'Handed back?' });
    await user.click(within(dialog).getByRole('button', { name: 'Handed back to seller' }));
    expect(await screen.findByText('Marked as handed back.')).toBeDefined();
    expect(calls[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('a normal return (refused) has no action, only the note', async () => {
    const shipment = agentShipmentFactory({
      status: 'returning_to_seller',
      attemptCount: 1,
      attempts: [
        { attemptNumber: 1, reason: 'customer_refused', note: null, createdAt: '2026-10-16T10:00:00.000Z' },
      ],
    });
    serveShipment(shipment);
    render(shipment);
    expect(
      await screen.findByText(
        'Return the parcel to Nile Crafts. The seller confirms it in their app.',
        {},
        { timeout: 5000 },
      ),
    ).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Shipment actions' })).toBeNull();
    expect(screen.getByText(/^Attempt 1: Customer refused the parcel$/)).toBeDefined();
  });

  it('SHIPMENT_INVALID_STATUS_TRANSITION reads the shipment again and explains', async () => {
    const user = userEvent.setup();
    const shipment = agentShipmentFactory();
    const state = serveShipment(shipment);
    serveAction('/agent/shipments/{shipmentId}/picked-up', [
      { status: 409, code: 'SHIPMENT_INVALID_STATUS_TRANSITION' },
    ]);
    render(shipment);
    await user.click(within(await actions()).getByRole('button', { name: 'Picked up' }));
    const before = state.reads;
    state.shipment = { ...shipment, status: 'picked_up' };
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Picked up' }));
    expect(
      await screen.findByText('This shipment changed meanwhile. Here is its current state.'),
    ).toBeDefined();
    await waitFor(() => {
      expect(state.reads).toBeGreaterThan(before);
    });
    expect(await within(await actions()).findByRole('button', { name: 'Start delivery' })).toBeDefined();
  });

  it("not (any more) the agent's: says so, with a way back", async () => {
    server.use(
      mockApi('get', '/agent/shipments/{shipmentId}', ({ reply }) => reply.error(404, 'SHIPMENT_NOT_FOUND'), {
        base: BFF_BASE,
      }),
    );
    render(agentShipmentFactory());
    expect(
      await screen.findByText("This shipment isn't assigned to you any more.", {}, { timeout: 5000 }),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to shipments' })).toBeDefined();
  });

  it('finished shipments are read-only', async () => {
    const shipment = agentShipmentFactory({ status: 'delivered', deliveredAt: '2026-10-16T12:00:00.000Z' });
    serveShipment(shipment);
    render(shipment);
    expect(
      await screen.findByRole('heading', { level: 1, name: `Order ${shipment.orderNumber}` }),
    ).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Shipment actions' })).toBeNull();
  });
});
